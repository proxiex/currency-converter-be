import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import * as bcrypt from 'bcrypt';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let configService: ConfigService;
  let prismaService: PrismaService;
  let redisService: RedisService;
  
  // Test user data
  const testUser = {
    email: 'test@example.com',
    password: 'Password123!',
    name: 'Test User'
  };
  const testNonce = 'test-nonce-' + Date.now();
  
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configService = app.get<ConfigService>(ConfigService);
    prismaService = app.get<PrismaService>(PrismaService);
    redisService = app.get<RedisService>(RedisService);

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    app.setGlobalPrefix('api');
    
    await app.init();
    
    // Clean up any existing test user
    await prismaService.user.deleteMany({
      where: { email: testUser.email }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prismaService.user.deleteMany({
      where: { email: testUser.email }
    });
    await app.close();
  });

  describe('Login Endpoint', () => {
    it('/api/auth/login (POST) - should validate request body', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({})
        .expect(400);
    });

    it('/api/auth/login (POST) - should validate email format', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'password123',
          nonce: testNonce
        })
        .expect(400);
    });
    
    it('/api/auth/login (POST) - should reject invalid credentials', async () => {
      // Create a test user first
      const hashedPassword = await bcrypt.hash(testUser.password, 10);
      await prismaService.user.create({
        data: {
          email: testUser.email,
          password: hashedPassword,
          name: testUser.name
        }
      });
      
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrong-password',
          nonce: testNonce + '1'
        })
        .expect(401);
    });
    
    it('/api/auth/login (POST) - should successfully login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
          nonce: testNonce + '2'
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
    });
    
    it('/api/auth/login (POST) - should reject reused nonce', async () => {
      // First login with a specific nonce
      const specificNonce = 'specific-nonce-' + Date.now();
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
          nonce: specificNonce
        })
        .expect(200);
      
      // Try to reuse the same nonce
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
          nonce: specificNonce
        })
        .expect(401);
    });
  });
  
  describe('Register Endpoint', () => {
    const newUser = {
      email: 'new-user@example.com',
      password: 'NewPassword123!',
      name: 'New User'
    };
    
    afterEach(async () => {
      // Clean up the newly registered user after tests
      await prismaService.user.deleteMany({
        where: { email: newUser.email }
      });
    });
    
    it('/api/auth/register (POST) - should validate request body', () => {
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send({})
        .expect(400);
    });
    
    it('/api/auth/register (POST) - should validate email format', () => {
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123'
        })
        .expect(400);
    });
    
    it('/api/auth/register (POST) - should validate password requirements', () => {
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: newUser.email,
          password: 'short'  // Too short password
        })
        .expect(400);
    });
    
    it('/api/auth/register (POST) - should successfully register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(newUser)
        .expect(201);
      
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(newUser.email);
      expect(response.body.user.name).toBe(newUser.name);
      
      // Verify user was created in the database
      const dbUser = await prismaService.user.findUnique({
        where: { email: newUser.email }
      });
      expect(dbUser).not.toBeNull();
    });
    
    it('/api/auth/register (POST) - should prevent duplicate registration', async () => {
      // Register the user first
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(newUser)
        .expect(201);
      
      // Try to register the same user again
      return request(app.getHttpServer())
        .post('/api/auth/register')
        .send(newUser)
        .expect(409);
    });
  });
});
