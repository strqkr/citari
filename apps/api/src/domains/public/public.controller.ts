import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Ip, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AbuseProtectionService } from "../../security/abuse-protection.service.js";
import { parseInput } from "../domain-http.js";
import { availabilityQuerySchema, confirmationNonceSchema, publicBookingSchema, slotHoldSchema, slugSchema } from "./public.schemas.js";
import { PublicService } from "./public.service.js";

@ApiTags("public")
@Controller("public/:slug")
export class PublicController {
  constructor(private readonly service: PublicService, private readonly abuse: AbuseProtectionService) {}

  @Get()
  tenant(@Param("slug") slug: string) { return this.service.tenant(parseInput(slugSchema, slug)); }

  @Get("services")
  services(@Param("slug") slug: string) { return this.service.services(parseInput(slugSchema, slug)); }

  @Get("locations")
  locations(@Param("slug") slug: string) { return this.service.locations(parseInput(slugSchema, slug)); }

  @Get("availability")
  availability(@Param("slug") slug: string, @Query() query: unknown) {
    return this.service.availability(parseInput(slugSchema, slug), parseInput(availabilityQuerySchema, query));
  }

  @Post("bookings")
  @HttpCode(201)
  @ApiOperation({ summary: "Create an idempotent public booking" })
  async create(@Param("slug") slug: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown, @Ip() ip = "unknown") {
    if (!key || key.length < 16 || key.length > 200) throw new BadRequestException("A 16-200 character Idempotency-Key header is required");
    const parsedSlug = parseInput(slugSchema, slug);
    await Promise.all([
      this.abuse.assertAllowed("public.booking.ip", ip, 30, 60 * 60, 15 * 60),
      this.abuse.assertAllowed("public.booking.tenant-ip", `${parsedSlug}:${ip}`, 12, 15 * 60, 15 * 60)
    ]);
    return this.service.createBooking(parsedSlug, parseInput(publicBookingSchema, body), key);
  }

  @Post("holds")
  @HttpCode(201)
  @ApiOperation({ summary: "Acquire an expiring, idempotent slot hold" })
  async hold(@Param("slug") slug: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown, @Ip() ip = "unknown") {
    this.assertIdempotencyKey(key);
    const parsedSlug = parseInput(slugSchema, slug);
    await Promise.all([
      this.abuse.assertAllowed("public.hold.ip", ip, 30, 60 * 60, 15 * 60),
      this.abuse.assertAllowed("public.hold.tenant-ip", `${parsedSlug}:${ip}`, 15, 15 * 60, 15 * 60)
    ]);
    return this.service.createHold(parsedSlug, parseInput(slotHoldSchema, body), key);
  }

  @Post("booking-confirmation")
  @HttpCode(200)
  @ApiOperation({ summary: "Consume a one-use booking confirmation nonce" })
  async confirmation(@Param("slug") slug: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown, @Ip() ip = "unknown") {
    this.assertIdempotencyKey(key);
    const parsed = parseInput(confirmationNonceSchema, body);
    await Promise.all([
      this.abuse.assertAllowed("public.booking-confirmation.ip", ip, 30, 15 * 60, 5 * 60),
      this.abuse.assertAllowed("public.booking-confirmation.token", parsed.confirmationNonce, 8, 15 * 60, 15 * 60)
    ]);
    return this.service.consumeConfirmation(parseInput(slugSchema, slug), parsed, key);
  }

  private assertIdempotencyKey(key: string | undefined): asserts key is string {
    if (!key || key.length < 16 || key.length > 200) throw new BadRequestException("A 16-200 character Idempotency-Key header is required");
  }
}
