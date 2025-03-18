import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @HttpCode(201)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered. Returns JWT token.' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'User with this email already exists' })
  @ApiResponse({ status: 429, description: 'Too many requests - rate limit exceeded' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Authenticate user and get JWT token' })
  @ApiResponse({ status: 200, description: 'User successfully authenticated. Returns JWT token.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or nonce already used' })
  @ApiResponse({ status: 429, description: 'Too many requests - rate limit exceeded' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
