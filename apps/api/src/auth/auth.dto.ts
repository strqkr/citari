import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength } from "class-validator";
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) mfaCode?: string;
}
export class RefreshDto { @IsString() @Length(32, 512) refreshToken!: string; }
export class LogoutDto { @IsString() @Length(32, 512) refreshToken!: string; }
export class ChangeInitialPasswordDto {
  @IsString() @Length(40, 128) challengeToken!: string;
  @IsString() @MinLength(16) @MaxLength(128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/) newPassword!: string;
}
export class MfaEnrollmentDto { @IsString() @Length(40, 128) challengeToken!: string; }
export class MfaConfirmationDto {
  @IsString() @Length(40, 128) challengeToken!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class IdentityEmailDto { @IsEmail() email!: string; }
export class VerifyEmailDto { @IsString() @Length(40, 128) challengeToken!: string; }
export class ResetPasswordDto {
  @IsString() @Length(40, 128) challengeToken!: string;
  @IsString() @MinLength(16) @MaxLength(128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/) newPassword!: string;
}
export class RegisterOwnerDto {
  @IsString() @MinLength(2) @MaxLength(200) businessName!: string;
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(100) slug!: string;
  @IsEmail() businessEmail!: string;
  @IsString() @MinLength(1) @MaxLength(100) ownerFirstName!: string;
  @IsString() @MinLength(1) @MaxLength(200) ownerLastName!: string;
  @IsEmail() ownerEmail!: string;
  @IsString() @MinLength(16) @MaxLength(128) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/) password!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}
