export type AvailabilityBlock = {
  availabilityBlockId: number;
  blockDate: string;
  startTime: string;
  endTime: string;
  isReserved?: boolean;
  locationId?: number;
};
