import { IsDateString, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from "class-validator";

export class PublicTrackingTokenDto {
  @IsString()
  @MinLength(40)
  @MaxLength(200)
  token!: string;
}

export class PublicTrackingVerifyDto extends PublicTrackingTokenDto {
  @IsString()
  @MinLength(40)
  @MaxLength(128)
  challengeToken!: string;

  @Matches(/^\d{6}$/)
  code!: string;
}

export class PublicTrackingLookupDto extends PublicTrackingTokenDto {
  @IsString()
  @MinLength(40)
  @MaxLength(128)
  accessGrant!: string;
}

export class PublicCancelByTokenDto extends PublicTrackingLookupDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PublicRescheduleByTokenDto extends PublicCancelByTokenDto {
  @IsDateString()
  startAt!: string;
}
