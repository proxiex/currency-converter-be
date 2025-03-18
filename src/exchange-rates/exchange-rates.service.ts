import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private readonly baseCurrency = 'USD'; // Default base currency
  private readonly supportedCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'NGN'];
  private apiKey: string;
  private readonly cacheExpirationTime = 3600000; // 1 hour in milliseconds
  private readonly apiUrl = 'https://openexchangerates.org/api/latest.json'

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const configApiKey = this.configService.get<string>('OPEN_EXCHANGE_RATES_API_KEY');
    if (configApiKey) {
      this.apiKey = configApiKey;
    } else {
      this.logger.warn('OPEN_EXCHANGE_RATES_API_KEY is not set. API calls will fail.');
    }
  }

  async getExchangeRates() {
    try {
      // First check if we have recent rates in the database
      const cachedRates = await this.getExchangeRatesFromDb();
      if (cachedRates.length > 0) {
        const mostRecentUpdate = cachedRates[0].lastUpdated;
        const now = new Date();
        
        // If cache is still valid, return cached data
        if (now.getTime() - mostRecentUpdate.getTime() < this.cacheExpirationTime) {
          this.logger.log('Using cached exchange rates');
          return this.formatExchangeRates(cachedRates);
        }
      }

      // If no valid cache, try to fetch from API
      try {
        return await this.fetchAndStoreExchangeRates();
      } catch (apiError) {
        this.logger.error(`API fetch failed: ${apiError.message}`, apiError.stack);
        
        // If API fetch fails but we have any cached rates, use them as fallback even if expired
        if (cachedRates.length > 0) {
          this.logger.warn('API fetch failed, using expired cached rates as fallback');
          return this.formatExchangeRates(cachedRates);
        }
        // If no cached rates, re-throw the error
        throw apiError;
      }
    } catch (error) {
      this.logger.error(`Error fetching exchange rates: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch exchange rates');
    }
  }

  async convertCurrency(userId: number, fromCurrency: string, toCurrency: string, amount: number) {
    // Validate currencies
    if (!this.supportedCurrencies.includes(fromCurrency) || !this.supportedCurrencies.includes(toCurrency)) {
      throw new Error('Unsupported currency');
    }

    // Get current exchange rates
    const rates = await this.getExchangeRates();
    
    // Get the exchange rates for both currencies
    const fromRate = rates.rates[fromCurrency];
    const toRate = rates.rates[toCurrency];
    
    if (!fromRate || !toRate) {
      throw new Error('Exchange rate not available');
    }
    
    // Calculate the conversion (convert through base currency)
    const valueInBaseCurrency = amount / fromRate;
    const convertedAmount = valueInBaseCurrency * toRate;
    
    // Calculate the exchange rate between the two currencies
    const exchangeRate = toRate / fromRate;
    
    // Store the transaction in the database
    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        fromCurrency,
        toCurrency,
        amount,
        convertedAmount,
        rate: exchangeRate,
      },
    });
    
    return {
      id: transaction.id,
      fromCurrency,
      toCurrency,
      amount,
      convertedAmount,
      exchangeRate,
      timestamp: transaction.createdAt,
    };
  }

  private async getExchangeRatesFromDb() {
    return this.prisma.exchangeRate.findMany({
      where: {
        baseCurrency: this.baseCurrency,
      },
      orderBy: {
        lastUpdated: 'desc',
      },
    });
  }

  private async fetchAndStoreExchangeRates() {
    try {
      this.logger.log(`Fetching exchange rates from ${this.apiUrl}`);
      
      const response = await axios.get(this.apiUrl, {
        params: {
          app_id: this.apiKey,
          // Note: Free plan doesn't support changing the base currency
          // so we'll get rates in USD and convert as needed
        }
      });
      
      const { base, rates, timestamp } = response.data;
      const updateTime = new Date(timestamp * 1000);
      
      this.logger.log(`Successfully fetched exchange rates, base: ${base}, updated: ${updateTime}`);
      
      // Filter to only supported currencies
      const supportedRates = {};
      for (const currency of this.supportedCurrencies) {
        if (rates[currency]) {
          supportedRates[currency] = rates[currency];
        }
      }
      
      // Store rates in database (using upsert to avoid duplicates)
      const updatePromises = Object.entries(supportedRates).map(([currency, rate]) => {
        return this.prisma.exchangeRate.upsert({
          where: {
            baseCurrency_currency: {
              baseCurrency: base,
              currency,
            },
          },
          update: {
            rate: rate as number,
            lastUpdated: updateTime,
          },
          create: {
            baseCurrency: base,
            currency,
            rate: rate as number,
            lastUpdated: updateTime,
          },
        });
      });
      
      await Promise.all(updatePromises);
      
      // Return formatted response
      return {
        base,
        rates: supportedRates,
        timestamp: updateTime.toISOString(),
      };
    } catch (error) {
      this.logger.error(`Error fetching from API: ${error.message}`, error.stack);
      throw error;
    }
  }

  private formatExchangeRates(rates) {
    // Convert from database format to API response format
    const formattedRates = {};
    for (const rate of rates) {
      formattedRates[rate.currency] = rate.rate;
    }
    
    return {
      base: this.baseCurrency,
      rates: formattedRates,
      timestamp: rates[0]?.lastUpdated.toISOString() || new Date().toISOString(),
    };
  }
  

}
