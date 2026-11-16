import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CreateUserDto, UpdateUserDto } from './dto';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    this.logger.log(`Creating user with email: ${createUserDto.email}`);
    
    // Map DTO fields to Prisma model
    // Note: supabaseId in DTO maps to supertokensId in DB (legacy field name)
    const { supabaseId, ...rest } = createUserDto;
    
    return this.prisma.user.create({
      data: {
        ...rest,
        supertokensId: supabaseId,
      },
    });
  }

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findBySupabaseId(supabaseId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      // Field is named supertokensId in schema (legacy), stores Supabase user ID
      where: { supertokensId: supabaseId },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    await this.findOne(id); // Verify user exists

    this.logger.log(`Updating user: ${id}`);
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
    });
  }

  async remove(id: string): Promise<User> {
    await this.findOne(id); // Verify user exists

    this.logger.log(`Soft deleting user: ${id}`);
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getOrCreateUser(
    email: string,
    supabaseId?: string,
  ): Promise<User> {
    let user = await this.findByEmail(email);

    if (!user) {
      user = await this.create({
        email,
        supabaseId,
      });
      this.logger.log(`Created new user for email: ${email}`);
    } else if (supabaseId && !user.supertokensId) {
      // Link Supabase ID if not already linked
      // Note: DB field is named supertokensId (legacy), stores Supabase user ID
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { supertokensId: supabaseId },
      });
      this.logger.log(`Linked Supabase ID to user: ${user.id}`);
    }

    return user;
  }
}
