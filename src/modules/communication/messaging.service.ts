import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation, ConversationParticipant, Message } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateConversationDto, SendMessageDto } from './dto/messaging.dto';
import type { ConversationResponse, MessageResponse } from './interfaces/communication.interface';
import { NotificationsService } from './notifications.service';

type ConversationWithParticipants = Conversation & { participants: ConversationParticipant[] };

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(creatorId: string, dto: CreateConversationDto): Promise<ConversationResponse> {
    const participantIds = Array.from(new Set([creatorId, ...dto.participantUserIds]));

    const users = await this.prisma.user.findMany({
      where: { id: { in: participantIds } },
      select: { id: true },
    });
    if (users.length !== participantIds.length) {
      throw new NotFoundException('One or more participants were not found');
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        type: dto.type ?? (participantIds.length > 2 ? 'GROUP' : 'DIRECT'),
        title: dto.title,
        participants: { create: participantIds.map((userId) => ({ userId })) },
      },
      include: { participants: true },
    });

    return this.toConversationResponse(conversation);
  }

  async listOwn(userId: string): Promise<ConversationResponse[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId, leftAt: null } } },
      include: { participants: true },
      orderBy: { updatedAt: 'desc' },
    });
    return conversations.map((conversation) => this.toConversationResponse(conversation));
  }

  async listMessages(
    userId: string,
    conversationId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<MessageResponse>> {
    await this.assertParticipant(userId, conversationId);

    const { skip, take } = toSkipTake(page, limit);
    const where = { conversationId, deletedAt: null };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.message.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.toMessageResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async sendMessage(
    senderId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageResponse> {
    const conversation = await this.assertParticipant(senderId, conversationId);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId,
          body: dto.body,
          messageType: dto.messageType ?? 'TEXT',
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      return created;
    });

    const recipients = conversation.participants.filter(
      (participant) => participant.userId !== senderId && !participant.leftAt,
    );
    await Promise.all(
      recipients.map((recipient) =>
        this.notifications.create({
          userId: recipient.userId,
          type: 'NEW_MESSAGE',
          title: 'New message',
          body: dto.body.slice(0, 140),
        }),
      ),
    );

    return this.toMessageResponse(message);
  }

  async markRead(userId: string, conversationId: string): Promise<void> {
    await this.assertParticipant(userId, conversationId);
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
  }

  private async assertParticipant(
    userId: string,
    conversationId: string,
  ): Promise<ConversationWithParticipants> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    const isParticipant = conversation.participants.some(
      (participant) => participant.userId === userId && !participant.leftAt,
    );
    if (!isParticipant) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }
    return conversation;
  }

  private toConversationResponse(conversation: ConversationWithParticipants): ConversationResponse {
    return {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      participantUserIds: conversation.participants.map((participant) => participant.userId),
    };
  }

  private toMessageResponse(message: Message): MessageResponse {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      messageType: message.messageType,
      body: message.body,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
    };
  }
}
