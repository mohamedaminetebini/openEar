import { z } from 'zod';
import { eqSchema } from '../equalizer/model.ts';
export const usbDeviceSchema = z.object({
  vendorId: z.string().regex(/^[a-f0-9]{4}$/),
  productId: z.string().regex(/^[a-f0-9]{4}$/),
  manufacturer: z.string().max(256),
  product: z.string().max(256),
  revision: z.string().regex(/^[a-f0-9]{4}$/),
});
export const nativeStateSchema = z.object({
  usbDevice: usbDeviceSchema.nullable().default(null),
  outputs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      receiver: z.boolean(),
      transport: z.enum(['usb', 'bluetooth', 'other']),
      brand: z.enum(['redragon']).nullish(),
    }),
  ),
  active: z.boolean(),
  target: z.string().nullable(),
  defaultOutput: z.string().nullable().default(null),
  eq: eqSchema,
  receiver: z
    .object({
      volume: z.number(),
      mute: z.boolean(),
      micGain: z.number(),
      micMute: z.boolean(),
      autoGain: z.boolean(),
    })
    .nullable(),
  error: z.string().nullable(),
});
export type NativeState = z.infer<typeof nativeStateSchema>;
export const nativeCommandSchema = z.discriminatedUnion('operation', [
  z
    .object({ operation: z.literal('start'), target: z.string().min(1).max(512), eq: eqSchema })
    .strict(),
  z.object({ operation: z.literal('eq'), eq: eqSchema }).strict(),
  z.object({ operation: z.literal('stop') }).strict(),
  z
    .object({ operation: z.enum(['volume', 'micGain']), value: z.number().int().min(0).max(100) })
    .strict(),
  z.object({ operation: z.enum(['mute', 'micMute', 'autoGain']), value: z.boolean() }).strict(),
]);
export type NativeCommand = z.infer<typeof nativeCommandSchema>;
