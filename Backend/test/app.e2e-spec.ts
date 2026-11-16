import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('name', 'NEO Backend API');
        expect(res.body).toHaveProperty('version');
        expect(res.body).toHaveProperty('environment');
      });
  });

  it('/health/liveness (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/liveness')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
