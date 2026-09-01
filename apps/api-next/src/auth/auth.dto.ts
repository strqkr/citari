import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength } from "class-validator";
export class LoginDto { @IsEmail() email!: string; @IsString() @MinLength(8) password!: string; @IsOptional() @IsUUID() tenantId?: string; }
export class RefreshDto { @IsString() @Length(32, 512) refreshToken!: string; }
export class LogoutDto { @IsString() @Length(32, 512) refreshToken!: string; }
export class RegisterOwnerDto {
  @IsString() @MinLength(2) @MaxLength(200) businessName!: string;
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(100) slug!: string;
  @IsEmail() businessEmail!: string;
  @IsString() @MinLength(1) @MaxLength(100) ownerFirstName!: string;
  @IsString() @MinLength(1) @MaxLength(200) ownerLastName!: string;
  @IsEmail() ownerEmail!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}
