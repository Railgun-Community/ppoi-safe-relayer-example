import debug from 'debug';
import configDefaults from '../config/config-defaults';
import { delay } from '../../util/promise-utils';
import promClient from 'prom-client';
import express from 'express';
import { collectMetrics } from './data-fetcher';
import { logger } from '../../util/logger';

const dbg = debug('relayer:monitoring');

let shouldServeMetrics = true;

export const initMonitoring = () => {
  if (!configDefaults.monitoring.shouldMonitor) {
    return;
  }
  initMetricEndpoint();
};

export const serveMetrics = async () => {
  try {
    dbg('attempting to collect metrics');
    collectMetrics();
  } catch (err: any) {
    logger.warn('Monitoring error');
    logger.error(err);
  } finally {
    await delay(configDefaults.monitoring.metricCollectionInterval);
    if (shouldServeMetrics) {
      serveMetrics();
    }
  }
};

export const initMetricEndpoint = async () => {
  promClient.collectDefaultMetrics();

  const metricServer = express();
  metricServer.get('/metrics', (req, res) => {
    dbg('metrics scraped');
    res.send(promClient.register.metrics());
  });

  metricServer.listen(9991, () =>
    dbg(`Listening for prometheus on port 9991 /metrics`),
  );

  if (shouldServeMetrics) {
    serveMetrics();
  }
};

export const stopServingMetrics = () => {
  shouldServeMetrics = false;
};
