import { z } from 'zod';
import { eqSchema } from '../equalizer/model.ts';
export const usbDeviceSchema = z.object({
  vendorId: z.string().regex(/^[a-f0-9]{4}$/),
  productId: z.string().regex(/^[a-f0-9]{4}$/),
  manufacturer: z.string().max(256),
  product: z.string().max(256),
  revision: z.string().regex(/^[a-f0-9]{4}$/),
});
export const noiseModeSchema = z.enum(['off', 'noiseCancellation', 'transparency']);
export const nativeStateSchema = z.object({
  usbDevice: usbDeviceSchema.nullable().default(null),
  outputs: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      receiver: z.boolean(),
      transport: z.enum(['usb', 'bluetooth', 'other']),
      brand: z.enum(['redragon']).nullish(),
      battery: z.number().int().min(0).max(100).nullish(),
      address: z.string().nullish(),
      volume: z.number().int().min(0).max(100).nullish(),
    }),
  ),
  active: z.boolean(),
  target: z.string().nullable(),
  defaultOutput: z.string().nullable().default(null),
  noise: z.object({ address: z.string(), mode: noiseModeSchema }).nullish(),
  pairedDevices: z.array(z.object({ address: z.string(), name: z.string().max(256) })).default([]),
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
  z
    .object({
      operation: z.literal('connect'),
      address: z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/),
    })
    .strict(),
  z
    .object({
      operation: z.literal('noise'),
      address: z.string().regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/),
      mode: noiseModeSchema.nullable(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('outputVolume'),
      output: z.string().min(1).max(512),
      value: z.number().int().min(0).max(100),
    })
    .strict(),
]);
export type NativeCommand = z.infer<typeof nativeCommandSchema>;
