import { Injectable, NotFoundException } from '@nestjs/common';
import type { Package } from '@prisma/client';
import {
  buildPaginationMeta,
  toSkipTake,
  type PaginatedResult,
} from '../../common/pagination/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreatePackageDto, UpdatePackageDto } from './dto/package.dto';
import type { PackageResponse } from './interfaces/billing.interface';

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePackageDto): Promise<PackageResponse> {
    const pkg = await this.prisma.package.create({
      data: {
        name: dto.name,
        description: dto.description,
        classesPerPeriod: dto.classesPerPeriod,
        classDurationMin: dto.classDurationMin,
        billingPeriod: dto.billingPeriod,
        price: dto.price,
        currency: dto.currency,
      },
    });
    return this.toResponse(pkg);
  }

  /** Public pricing page - active packages only. */
  async listPublic(): Promise<PackageResponse[]> {
    const packages = await this.prisma.package.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { price: 'asc' },
    });
    return packages.map((pkg) => this.toResponse(pkg));
  }

  async adminList(page: number, limit: number): Promise<PaginatedResult<PackageResponse>> {
    const { skip, take } = toSkipTake(page, limit);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.package.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.package.count(),
    ]);
    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async update(id: string, dto: UpdatePackageDto): Promise<PackageResponse> {
    const existing = await this.prisma.package.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Package not found');
    }
    const pkg = await this.prisma.package.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        classesPerPeriod: dto.classesPerPeriod,
        classDurationMin: dto.classDurationMin,
        billingPeriod: dto.billingPeriod,
        price: dto.price,
        status: dto.status,
      },
    });
    return this.toResponse(pkg);
  }

  private toResponse(pkg: Package): PackageResponse {
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      classesPerPeriod: pkg.classesPerPeriod,
      classDurationMin: pkg.classDurationMin,
      billingPeriod: pkg.billingPeriod,
      price: Number(pkg.price),
      currency: pkg.currency,
      status: pkg.status,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
    };
  }
}
