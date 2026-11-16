import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@neo.ai' },
    update: {},
    create: {
      email: 'admin@neo.ai',
      name: 'NEO Admin',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create test user
  const testUser = await prisma.user.upsert({
    where: { email: 'test@neo.ai' },
    update: {},
    create: {
      email: 'test@neo.ai',
      name: 'Test User',
      role: UserRole.USER,
      isActive: true,
    },
  });

  console.log('✅ Created test user:', testUser.email);

  console.log('🎉 Database seed completed!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
