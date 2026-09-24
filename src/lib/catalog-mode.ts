// Demo is available for local development only; published sites always use real offers.
export function demoEnabled() {
  return process.env.NODE_ENV !== 'production';
}
