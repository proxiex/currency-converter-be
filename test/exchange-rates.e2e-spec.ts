import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

describe('ExchangeRatesController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let jwtService: JwtService;
  let authToken: string;
  
  // Test user data
  const testUser = {
    id: 0,
    email: 'exchange-test@example.com',
    password: 'Password123!',
    name: 'Exchange Test User'
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

  describe('Get Exchange Rates', () => {
    it('/api/exchange-rates (GET) - should return current exchange rates', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/exchange-rates')
        .expect(200);
      
      expect(response.body).toHaveProperty('base');
      expect(response.body).toHaveProperty('rates');
      expect(response.body.rates).toHaveProperty('USD');
      expect(response.body.rates).toHaveProperty('EUR');
    });
  });
  
  describe('Convert Currency', () => {
    it('/api/exchange-rates/convert (POST) - should require authentication', () => {
      return request(app.getHttpServer())
        .post('/api/exchange-rates/convert')
        .send({
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          amount: 100
        })
        .expect(401);
    });
    
    it('/api/exchange-rates/convert (POST) - should validate request body', () => {
      return request(app.getHttpServer())
        .post('/api/exchange-rates/convert')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });
    
    it('/api/exchange-rates/convert (POST) - should validate currency codes', () => {
      return request(app.getHttpServer())
        .post('/api/exchange-rates/convert')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromCurrency: 'INVALID',
          toCurrency: 'EUR',
          amount: 100
        })
        .expect(400);
    });
    
    it('/api/exchange-rates/convert (POST) - should validate amount is positive', () => {
      return request(app.getHttpServer())
        .post('/api/exchange-rates/convert')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          amount: -100
        })
        .expect(400);
    });
    
    it('/api/exchange-rates/convert (POST) - should successfully convert currency', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/exchange-rates/convert')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          amount: 100
        })
        .expect(201);
      
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('fromCurrency', 'USD');
      expect(response.body).toHaveProperty('toCurrency', 'EUR');
      expect(response.body).toHaveProperty('amount', 100);
      expect(response.body).toHaveProperty('convertedAmount');
      expect(response.body).toHaveProperty('exchangeRate');
      expect(response.body).toHaveProperty('timestamp');
      
      // Check if transaction was created in the database
      const transaction = await prismaService.transaction.findUnique({
        where: { id: response.body.id }
      });
      
      expect(transaction).not.toBeNull();
      expect(transaction.userId).toBe(testUser.id);
    });
  });
});
