import {
  Controller,
  Get,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  UploadConfigResponse,
  UploadDocumentResponse,
} from '@smart-dms/shared-dto';
import { CurrentUser, Roles } from '../common/auth.decorators';
import type { AuthenticatedUser } from '../common/authenticated-user';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Get('config')
  config(): UploadConfigResponse {
    return this.uploadsService.configResponse();
  }

  @Post('documents')
  @Roles('Admin', 'User')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Body('tenantId') tenantId: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UploadDocumentResponse> {
    return this.uploadsService.acceptDocumentUpload(file, user, tenantId);
  }
}
