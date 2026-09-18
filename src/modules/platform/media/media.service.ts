import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MediaAttachment, MediaFile } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { STORAGE_PROVIDER, type StorageProvider } from '../../../integrations/storage/storage-provider.interface';
import { PrismaService } from '../../../prisma/prisma.service';
import { ROLE_CODES } from '../../auth/constants/roles.constant';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { AttachMediaDto, UploadMediaDto } from './dto/upload-media.dto';
import type { MediaAttachmentResponse, MediaFileResponse } from './interfaces/media.interface';

/** Entity types callers may attach media to - enforced here per the schema's polymorphic-attachment comment. */
const ALLOWED_ENTITY_TYPES = new Set(['STUDENT_PROFILE', 'TEACHER_PROFILE', 'COURSE', 'TESTIMONIAL']);

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async upload(
    user: AuthenticatedUser,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    dto: UploadMediaDto,
  ): Promise<MediaFileResponse> {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
      );
    }

    const storageKey = `${randomUUID()}${path.extname(file.originalname)}`;
    await this.storage.save(storageKey, file.buffer);

    const mediaFile = await this.prisma.mediaFile.create({
      data: {
        storageProvider: 'local',
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        visibility: dto.visibility ?? 'PRIVATE',
        uploadedBy: user.id,
      },
    });

    if (dto.entityType && dto.entityId) {
      await this.attach(user, mediaFile.id, { entityType: dto.entityType, entityId: dto.entityId });
    }

    return this.toFileResponse(mediaFile);
  }

  async getMetadata(user: AuthenticatedUser | undefined, id: string): Promise<MediaFileResponse> {
    const mediaFile = await this.findOrThrow(id);
    this.assertCanRead(user, mediaFile);
    return this.toFileResponse(mediaFile);
  }

  async getContent(
    user: AuthenticatedUser | undefined,
    id: string,
  ): Promise<{ buffer: Buffer; mediaFile: MediaFile }> {
    const mediaFile = await this.findOrThrow(id);
    this.assertCanRead(user, mediaFile);
    const buffer = await this.storage.read(mediaFile.storageKey);
    return { buffer, mediaFile };
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const mediaFile = await this.findOrThrow(id);
    this.assertCanWrite(user, mediaFile);
    await this.storage.delete(mediaFile.storageKey);
    await this.prisma.mediaFile.delete({ where: { id } });
  }

  async attach(
    user: AuthenticatedUser,
    mediaFileId: string,
    dto: AttachMediaDto,
  ): Promise<MediaAttachmentResponse> {
    if (!ALLOWED_ENTITY_TYPES.has(dto.entityType)) {
      throw new BadRequestException(
        `Unsupported entityType "${dto.entityType}". Allowed: ${Array.from(ALLOWED_ENTITY_TYPES).join(', ')}`,
      );
    }
    const mediaFile = await this.findOrThrow(mediaFileId);
    this.assertCanWrite(user, mediaFile);

    const attachment = await this.prisma.mediaAttachment.create({
      data: { mediaFileId, entityType: dto.entityType, entityId: dto.entityId },
    });

    return this.toAttachmentResponse(attachment, mediaFile);
  }

  async listForEntity(
    user: AuthenticatedUser | undefined,
    entityType: string,
    entityId: string,
  ): Promise<MediaAttachmentResponse[]> {
    const attachments = await this.prisma.mediaAttachment.findMany({
      where: { entityType, entityId },
      include: { mediaFile: true },
      orderBy: { createdAt: 'desc' },
    });
    return attachments
      .filter((attachment) => this.canRead(user, attachment.mediaFile))
      .map((attachment) => this.toAttachmentResponse(attachment, attachment.mediaFile));
  }

  private canRead(user: AuthenticatedUser | undefined, mediaFile: MediaFile): boolean {
    if (mediaFile.visibility === 'PUBLIC') return true;
    if (!user) return false;
    if (user.roles.includes(ROLE_CODES.ADMIN) || user.roles.includes(ROLE_CODES.SUPER_ADMIN)) return true;
    return mediaFile.uploadedBy === user.id;
  }

  private assertCanRead(user: AuthenticatedUser | undefined, mediaFile: MediaFile): void {
    if (this.canRead(user, mediaFile)) return;
    throw new ForbiddenException('You do not have access to this file');
  }

  private assertCanWrite(user: AuthenticatedUser, mediaFile: MediaFile): void {
    if (user.roles.includes(ROLE_CODES.ADMIN) || user.roles.includes(ROLE_CODES.SUPER_ADMIN)) return;
    if (mediaFile.uploadedBy === user.id) return;
    throw new ForbiddenException('You do not have access to this file');
  }

  private async findOrThrow(id: string): Promise<MediaFile> {
    const mediaFile = await this.prisma.mediaFile.findUnique({ where: { id } });
    if (!mediaFile) {
      throw new NotFoundException('File not found');
    }
    return mediaFile;
  }

  private toFileResponse(mediaFile: MediaFile): MediaFileResponse {
    return {
      id: mediaFile.id,
      originalName: mediaFile.originalName,
      mimeType: mediaFile.mimeType,
      sizeBytes: Number(mediaFile.sizeBytes),
      visibility: mediaFile.visibility,
      uploadedBy: mediaFile.uploadedBy,
      createdAt: mediaFile.createdAt,
    };
  }

  private toAttachmentResponse(
    attachment: MediaAttachment,
    mediaFile: MediaFile,
  ): MediaAttachmentResponse {
    return {
      id: attachment.id,
      mediaFileId: attachment.mediaFileId,
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      createdAt: attachment.createdAt,
      file: this.toFileResponse(mediaFile),
    };
  }
}
