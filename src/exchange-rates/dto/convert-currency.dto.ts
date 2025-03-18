import { IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConvertCurrencyDto {
  @ApiProperty({
    description: 'Source currency code',
    example: 'USD',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @ApiProperty({
    description: 'Target currency code',
    example: 'EUR',
    required: true
  })
  @IsString()
  @IsNotEmpty()
  toCurrency: string;

  @ApiProperty({
    description: 'Amount to convert',
    example: 100.50,
    required: true,
    minimum: 0
  })
  @IsNumber()
  @Min(0)
  amount: number;
}
