import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...\n');

  // ============================================================
  // 1. BRANCHES
  // ============================================================
  console.log('🏢 Creating branches...');
  await prisma.branch.createMany({
    data: [
      { id: 'B001', name: 'Main Store', address: '123 Market Street', phone: '+1234567890' },
      { id: 'B002', name: 'Downtown Branch', address: '456 City Center', phone: '+1234567891' },
      { id: 'B003', name: 'Mall Outlet', address: '789 Shopping Mall', phone: '+1234567892' },
    ],
    skipDuplicates: true,
  });
  console.log('✅ 3 branches created\n');

  // ============================================================
  // 2. COLORS
  // ============================================================
  console.log('🎨 Creating colors...');
  await prisma.color.createMany({
    data: [
      { name: 'Red',    hexCode: '#FF0000' },
      { name: 'Blue',   hexCode: '#0000FF' },
      { name: 'Green',  hexCode: '#00FF00' },
      { name: 'Black',  hexCode: '#000000' },
      { name: 'White',  hexCode: '#FFFFFF' },
      { name: 'Yellow', hexCode: '#FFFF00' },
      { name: 'Pink',   hexCode: '#FFC0CB' },
      { name: 'Purple', hexCode: '#800080' },
      { name: 'Orange', hexCode: '#FFA500' },
      { name: 'Brown',  hexCode: '#8B4513' },
      { name: 'Gray',   hexCode: '#808080' },
      { name: 'Navy',   hexCode: '#000080' },
      { name: 'Plain Cloth', hexCode: '#CCCCCC' },
    ],
    skipDuplicates: true,
  });
  console.log('✅ 12 colors created\n');

  // ============================================================
  // 3. EMPLOYEES (with hashed passwords)
  // ============================================================
  console.log('👤 Creating employees...');
  const adminPassword = await bcrypt.hash('admin123', 10);
  const managerPassword = await bcrypt.hash('manager123', 10);
  const employeePassword = await bcrypt.hash('employee123', 10);

  const admin = await prisma.employee.upsert({
    where: { email: 'admin@textile.com' },
    update: {},
    create: {
      name: 'System Admin',
      email: 'admin@textile.com',
      phone: '+1000000001',
      role: 'ADMIN',
      passwordHash: adminPassword,
    },
  });

  const manager = await prisma.employee.upsert({
    where: { email: 'manager@textile.com' },
    update: {},
    create: {
      name: 'John Manager',
      email: 'manager@textile.com',
      phone: '+1000000002',
      role: 'MANAGER',
      passwordHash: managerPassword,
    },
  });

  const employee = await prisma.employee.upsert({
    where: { email: 'employee@textile.com' },
    update: {},
    create: {
      name: 'Sarah Employee',
      email: 'employee@textile.com',
      phone: '+1000000003',
      role: 'EMPLOYEE',
      passwordHash: employeePassword,
    },
  });
  console.log('✅ 3 employees created (admin, manager, employee)\n');

  // ============================================================
  // 4. ASSIGN EMPLOYEES TO BRANCHES
  // ============================================================
  console.log('🔗 Assigning employees to branches...');
  await prisma.branchEmployee.createMany({
    data: [
      { branchId: 'B001', employeeId: admin.id },
      { branchId: 'B001', employeeId: manager.id },
      { branchId: 'B001', employeeId: employee.id },
      { branchId: 'B002', employeeId: manager.id },
    ],
    skipDuplicates: true,
  });
  console.log('✅ Employees assigned to branches\n');

  // ============================================================
  // 5. CUSTOMERS
  // ============================================================
  console.log('👥 Creating customers...');
  await prisma.customer.createMany({
    data: [
      { name: 'Alice Johnson', phone: '+15551001', email: 'alice@example.com', branchId: 'B001' },
      { name: 'Bob Smith',     phone: '+15551002', email: 'bob@example.com',   branchId: 'B001' },
      { name: 'Carol White',   phone: '+15551003', email: 'carol@example.com', branchId: 'B002' },
    ],
    skipDuplicates: true,
  });
  console.log('✅ 3 customers created\n');

  // ============================================================
  // 6. PLAIN CLOTH PRICING
  // ============================================================
  console.log('📐 Creating plain cloth pricing...');
  await prisma.plainClothPricing.createMany({
    data: [
      { id: 'COTTON_BASIC',   name: 'Basic Cotton',    pricePerM: 5.00 },
      { id: 'COTTON_PREMIUM', name: 'Premium Cotton',  pricePerM: 12.00 },
      { id: 'SILK',           name: 'Silk',            pricePerM: 25.00 },
      { id: 'LINEN',          name: 'Linen',           pricePerM: 18.00 },
      { id: 'POLYESTER',      name: 'Polyester',       pricePerM: 8.00 },
    ],
    skipDuplicates: true,
  });
  console.log('✅ 5 plain cloth types created\n');

  // ============================================================
  // 7. SAMPLE INVENTORY ITEMS
  // ============================================================
  console.log('📦 Creating inventory items...');
  const redColor   = await prisma.color.findUnique({ where: { name: 'Red' } });
  const blueColor  = await prisma.color.findUnique({ where: { name: 'Blue' } });
  const blackColor = await prisma.color.findUnique({ where: { name: 'Black' } });

  if (redColor && blueColor && blackColor) {
    await prisma.inventoryItem.createMany({
      data: [
        { id: 'B001-001-R', branchId: 'B001', code: 1, colorId: redColor.id,   type: 'ROLL',  meters: 50.00, costPrice: 3.50 },
        { id: 'B001-001-B', branchId: 'B001', code: 1, colorId: blueColor.id,  type: 'ROLL',  meters: 45.00, costPrice: 3.50 },
        { id: 'B001-002-K', branchId: 'B001', code: 2, colorId: blackColor.id, type: 'ROLL',  meters: 60.00, costPrice: 4.00 },
        { id: 'B001-003-R', branchId: 'B001', code: 3, colorId: redColor.id,   type: 'PIECE', pieceLength: 2.50, quantity: 10, costPrice: 8.00 },
        { id: 'B002-001-R', branchId: 'B002', code: 1, colorId: redColor.id,   type: 'ROLL',  meters: 40.00, costPrice: 3.50 },
        { id: 'B002-002-B', branchId: 'B002', code: 2, colorId: blueColor.id,  type: 'ROLL',  meters: 55.00, costPrice: 3.50 },
      ],
      skipDuplicates: true,
    });
    console.log('✅ 6 inventory items created\n');
  }

  // ============================================================
  // 8. TRUSTEE
  // ============================================================
  console.log('🤝 Creating trustee...');
  const trustee = await prisma.trustee.upsert({
    where: { name: 'Mr. Investor' },
    update: {},
    create: {
      name: 'Mr. Investor',
      contactInfo: 'investor@example.com',
    },
  });

  await prisma.trusteePermission.createMany({
    data: [
      { trusteeId: trustee.id, branchId: 'B001', percentage: 15.00 },
      { trusteeId: trustee.id, branchId: 'B002', percentage: 10.00 },
    ],
    skipDuplicates: true,
  });
  console.log('✅ 1 trustee created with 2 branch permissions\n');

  // ============================================================
  // 9. DEFAULT SETTINGS
  // ============================================================
  console.log('⚙️  Creating default settings...');
  await prisma.setting.createMany({
    data: [
      { key: 'company_name',    value: 'Textile ERP Inc.',  description: 'Company display name' },
      { key: 'currency',        value: 'USD',               description: 'Default currency' },
      { key: 'tax_rate',        value: 0.0,                 description: 'Default tax rate (0-1)' },
      { key: 'low_stock_alert', value: 10,                  description: 'Trigger alert below this meter count' },
    ],
    skipDuplicates: true,
  });
  console.log('✅ 4 default settings created\n');

  // ============================================================
  // DONE
  // ============================================================
  console.log('============================================================');
  console.log('🎉 SEED COMPLETE!');
  console.log('============================================================');
  console.log('\n📋 LOGIN CREDENTIALS:');
  console.log('   Admin:    admin@textile.com    / admin123');
  console.log('   Manager:  manager@textile.com  / manager123');
  console.log('   Employee: employee@textile.com / employee123');
  console.log('\n⚠️  Change these passwords in production!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
