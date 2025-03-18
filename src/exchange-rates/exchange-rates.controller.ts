import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import { ConvertCurrencyDto } from './dto/convert-currency.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Exchange Rates')
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private exchangeRatesService: ExchangeRatesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current exchange rates' })
  @ApiResponse({ status: 200, description: 'Returns the current exchange rates' })
  @ApiResponse({ status: 503, description: 'External exchange rate service unavailable' })
  async getExchangeRates() {
    return this.exchangeRatesService.getExchangeRates();
  }

  @Post('convert')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Convert currency and record transaction' })
  @ApiResponse({ status: 200, description: 'Currency converted successfully, returns conversion details and transaction ID' })
  @ApiResponse({ status: 400, description: 'Invalid currency or amount' })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing token' })
  @ApiResponse({ status: 500, description: 'Internal server error during conversion' })
  async convertCurrency(@Body() convertCurrencyDto: ConvertCurrencyDto, @Request() req) {
    const userId = req.user.id;
    return this.exchangeRatesService.convertCurrency(
      userId,
      convertCurrencyDto.fromCurrency,
      convertCurrencyDto.toCurrency,
      convertCurrencyDto.amount,
    );
  }
}
