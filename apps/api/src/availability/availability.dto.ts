import { Type } from "class-transformer";
import { IsDate, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AvailabilityWindowQuery {
  @Type(() => Date)
  @IsDate()
  from!: Date;

  @Type(() => Date)
  @IsDate()
  to!: Date;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class CreateAvailabilityBlockDto {
  @IsUUID()
  locationId!: string;

  @Type(() => Date)
  @IsDate()
  startsAt!: Date;

  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
