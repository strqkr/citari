/** @type {import('next').NextConfig} */
const nextConfig = {
  // Genera un servidor autocontenido en .next/standalone (solo el codigo y las
  // dependencias que realmente se usan) para una imagen de produccion liviana.
  output: "standalone"
};

export default nextConfig;
