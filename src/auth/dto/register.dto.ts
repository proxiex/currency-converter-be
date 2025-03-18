import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    required: true
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'User password (minimum 6 characters)',
    example: 'password123',
    required: true,
    minLength: 6
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
  
  @ApiProperty({
    description: 'User name (optional)',
    example: 'John Doe',
    required: false
  })
  @IsString()
  @IsOptional()
  name?: string;
}
