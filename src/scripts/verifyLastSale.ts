import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function verifyLastSale() {
  console.log('🔍 Verifying Last Sale EmployeeId...\n');

  try {
    // Fetch admin by email
    const admin = await prisma.employee.findUnique({
      where: { email: 'admin@textile.com' },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!admin) {
      console.error('❌ Admin user not found (admin@textile.com)');
      console.log('   Hint: Ensure the admin account exists in the database.');
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log(`✅ Admin Found:`);
    console.log(`   ID: ${admin.id}`);
    console.log(`   Name: ${admin.name}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${admin.role}\n`);

    // Fetch last sale (most recent by createdAt)
    const lastSale = await prisma.sale.findFirst({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        employeeId: true,
        branchId: true,
        customerName: true,
        totalPrice: true,
        createdAt: true,
        employee: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!lastSale) {
      console.error('❌ No sales found in the database');
      console.log('   Hint: Create a sale first via the Sales UI and try again.\n');
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log(`✅ Last Sale Found:`);
    console.log(`   Sale ID: ${lastSale.id}`);
    console.log(`   Created At: ${lastSale.createdAt.toISOString()}`);
    console.log(`   Employee ID: ${lastSale.employeeId}`);
    console.log(`   Employee Name: ${lastSale.employee?.name ?? 'N/A'}`);
    console.log(`   Employee Email: ${lastSale.employee?.email ?? 'N/A'}`);
    console.log(`   Branch ID: ${lastSale.branchId}`);
    console.log(`   Customer: ${lastSale.customerName}`);
    console.log(`   Total Price: $${lastSale.totalPrice}\n`);

    // Compare
    const match = lastSale.employeeId === admin.id;

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`VERIFICATION RESULT:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Admin ID:            ${admin.id}`);
    console.log(`Last Sale EmployeeId: ${lastSale.employeeId}`);
    console.log(`Match:               ${match ? '✅ TRUE' : '❌ FALSE'}\n`);

    if (match) {
      console.log('✨ SUCCESS! The last sale was created by the authenticated admin user.');
    } else {
      console.log('⚠️  MISMATCH! The last sale was created by a different employee.');
      console.log(`   Expected: ${admin.id}`);
      console.log(`   Got: ${lastSale.employeeId}`);
    }

    console.log();
  } catch (error) {
    console.error('❌ Error during verification:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error('   Unknown error occurred');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyLastSale();
