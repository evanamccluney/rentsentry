export function generateTenantOtp(): string {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return (100000 + (values[0] % 900000)).toString()
}
