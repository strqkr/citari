import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
export class PublicCancelDto { @IsInt() @Min(1) version!: number; @IsOptional() @IsString() @MaxLength(500) reason?: string; }
export class PublicRescheduleDto extends PublicCancelDto { @IsDateString() startAt!: string; }
