import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
export class ListBookingsQuery { @IsOptional() @IsDateString() from?: string; @IsOptional() @IsDateString() to?: string; @IsOptional() @IsInt() @Min(1) page?: number; @IsOptional() @IsInt() @Min(1) limit?: number; }
export class BookingAvailabilityQuery { @IsDateString() from!: string; @IsDateString() to!: string; }
export class CreateBookingDto {
  @IsUUID() customerId!: string; @IsUUID() serviceId!: string; @IsUUID() locationId!: string; @IsDateString() startAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) customerNotes?: string; @IsOptional() @IsString() @MaxLength(1000) internalNotes?: string;
}
export class TransitionBookingDto { @IsInt() @Min(1) version!: number; @IsOptional() @IsString() @MaxLength(500) reason?: string; }
export class RescheduleBookingDto extends TransitionBookingDto { @IsDateString() startAt!: string; }
