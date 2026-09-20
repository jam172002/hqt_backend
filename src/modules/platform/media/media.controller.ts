import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { OptionalJwtAccessGuard } from '../../auth/guards/optional-jwt-access.guard';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AttachMediaDto, UploadMediaDto } from './dto/upload-media.dto';
import { MediaService } from './media.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadMediaDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file was uploaded (expected multipart field "file")');
    }
    return this.mediaService.upload(user, file, dto);
  }

  @Public()
  @UseGuards(OptionalJwtAccessGuard)
  @Get('entity/:entityType/:entityId')
  listForEntity(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.mediaService.listForEntity(user, entityType, entityId);
  }

  @Public()
  @UseGuards(OptionalJwtAccessGuard)
  @Get(':id')
  getMetadata(@CurrentUser() user: AuthenticatedUser | undefined, @Param('id') id: string) {
    return this.mediaService.getMetadata(user, id);
  }

  @Public()
  @UseGuards(OptionalJwtAccessGuard)
  @Get(':id/file')
  async getContent(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mediaFile } = await this.mediaService.getContent(user, id);
    res.setHeader('Content-Type', mediaFile.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${mediaFile.originalName}"`);
    if (mediaFile.visibility === 'PUBLIC') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
    res.send(buffer);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.mediaService.remove(user, id);
  }

  @Post(':id/attach')
  attach(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AttachMediaDto,
  ) {
    return this.mediaService.attach(user, id, dto);
  }
}
