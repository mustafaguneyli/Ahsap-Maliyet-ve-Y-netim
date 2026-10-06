import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
  const allowedOrigins = [
    frontendOrigin,
    frontendOrigin.replace('://localhost', '://127.0.0.1'),
    frontendOrigin.replace('://127.0.0.1', '://localhost'),
  ];
  app.enableCors({
    origin: [...new Set(allowedOrigins)],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
