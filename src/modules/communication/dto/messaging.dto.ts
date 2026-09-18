import { ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

const CONVERSATION_TYPES = ['DIRECT', 'GROUP', 'INSTITUTE'] as const;

export class CreateConversationDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  participantUserIds!: string[];

  @IsOptional()
  @IsIn(CONVERSATION_TYPES)
  type?: (typeof CONVERSATION_TYPES)[number];

  @IsOptional()
  @IsString()
  title?: string;
}

const MESSAGE_TYPES = ['TEXT', 'IMAGE', 'FILE'] as const;

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsIn(MESSAGE_TYPES)
  messageType?: (typeof MESSAGE_TYPES)[number];
}
