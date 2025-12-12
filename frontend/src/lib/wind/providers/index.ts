// SPDX-License-Identifier: Apache-2.0

/**
 * Wind Data Providers Index
 * Exports all wind data providers
 */

export { gfsProvider } from './gfsProvider';
export { iconProvider, getICONDataUrls } from './iconProvider';
export { era5Provider, verifyCDSApiKey, getERA5Availability } from './era5Provider';
export { openWeatherProvider } from './openWeatherProvider';
