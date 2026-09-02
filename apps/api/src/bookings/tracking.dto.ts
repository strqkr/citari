import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
export class PublicTrackingLookupDto { @IsString() @MaxLength(200) token!: string; }
export class PublicCancelDto { @IsInt() @Min(1) version!: number; @IsOptional() @IsString() @MaxLength(500) reason?: string; }
export class PublicRescheduleDto extends PublicCancelDto { @IsDateString() startAt!: string; }
export class PublicCancelByTokenDto extends PublicCancelDto { @IsString() @MaxLength(200) token!: string; }
export class PublicRescheduleByTokenDto extends PublicRescheduleDto { @IsString() @MaxLength(200) token!: string; }
