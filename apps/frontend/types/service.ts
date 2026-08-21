export type Service = {
  serviceId: number;
  name: string;
  description: string;
  durationMinutes: number;
  price?: number;
  showPrice: boolean;
};
