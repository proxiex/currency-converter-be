import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

describe('UserController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtService: JwtService;
  let authToken: string;
  
  // Test user data
  const testUser = {
    id: 0,
    email: 'user-test@example.com',
    password: 'Password123!',
    name: 'User Test'
  };
  
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prismaService = app.get<PrismaService>(PrismaService);
    jwtService = app.get<JwtService>(JwtService);

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));

    app.setGlobalPrefix('api');

    await app.init();
    
    // Create a test user for authentication
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    const user = await prismaService.user.create({
      data: {
        email: testUser.email,
        password: hashedPassword,
        name: testUser.name
      }
    });
    
    testUser.id = user.id;
    
    // Create a JWT token for this user
    const payload = { 
      sub: user.id, 
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
    };
    
    authToken = jwtService.sign(payload);
    
    // Create some transactions for this user
    await prismaService.transaction.createMany({
      data: [
        {
          userId: user.id,
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          amount: 100,
          convertedAmount: 93,
          rate: 0.93
        },
        {
          userId: user.id,
          fromCurrency: 'EUR',
          toCurrency: 'GBP',
          amount: 200,
          convertedAmount: 156,
          rate: 0.78
        }
      ]
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prismaService.transaction.deleteMany({
      where: { userId: testUser.id }
    });
    
    await prismaService.user.delete({
      where: { id: testUser.id }
    });
    
    await app.close();
  });

  describe('Get User Transactions', () => {
    it('/api/user/transactions (GET) - should require authentication', () => {
      return request(app.getHttpServer())
        .get('/api/user/transactions')
        .expect(401);
    });
    
    it('/api/user/transactions (GET) - should return user transactions', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/user/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      
      // Check transaction data
      const firstTransaction = response.body[0];
      expect(firstTransaction).toHaveProperty('id');
      expect(firstTransaction).toHaveProperty('fromCurrency');
      expect(firstTransaction).toHaveProperty('toCurrency');
      expect(firstTransaction).toHaveProperty('amount');
      expect(firstTransaction).toHaveProperty('convertedAmount');
      expect(firstTransaction).toHaveProperty('rate');
      expect(firstTransaction).toHaveProperty('createdAt');
    });
    
    it('/api/user/transactions (GET) - should not return other users transactions', async () => {
      // Create another user with a transaction
      const otherUser = await prismaService.user.create({
        data: {
          email: 'other-user@example.com',
          password: await bcrypt.hash('OtherPassword123!', 10),
          name: 'Other User'
        }
      });
      
      await prismaService.transaction.create({
        data: {
          userId: otherUser.id,
          fromCurrency: 'USD',
          toCurrency: 'JPY',
          amount: 50,
          convertedAmount: 7500,
          rate: 150
        }
      });
      
      // Get transactions with our original test user's token
      const response = await request(app.getHttpServer())
        .get('/api/user/transactions')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      // We should still only see our 2 original transactions
      expect(response.body.length).toBe(2);
      
      // Ensure none of the transactions are for the JPY conversion (which belongs to the other user)
      const jpyTransactions = response.body.filter(t => t.toCurrency === 'JPY');
      expect(jpyTransactions.length).toBe(0);
      
      // Clean up the other user
      await prismaService.transaction.deleteMany({
        where: { userId: otherUser.id }
      });
      
      await prismaService.user.delete({
        where: { id: otherUser.id }
      });
    });
    
    it('/api/user/transactions (GET) - should handle invalid JWT token', () => {
      return request(app.getHttpServer())
        .get('/api/user/transactions')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
