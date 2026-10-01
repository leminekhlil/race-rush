import type { WebSocket } from 'ws';
import { MAX_STATE_RATE, NO_UPGRADES, type ServerMessage, type VehicleId } from '@race-rush/shared';
import type { TicketPayload } from './tickets';

let anonCounter = 0;

/** One connected player. */
export class Client {
  readonly id: string;
  readonly userId: number | null;
  name: string;
  level: number;
  readonly ticket: TicketPayload | null;
  lobbyCode: string | null = null;
  vehicle: VehicleId = 'sport';
  color = 'red';
  alive = true;
  private msgWindowStart = Date.now();
  private msgCount = 0;

  constructor(
    private readonly socket: WebSocket,
    ticket: TicketPayload | null,
    anonName?: string,
  ) {
    this.ticket = ticket;
    if (ticket) {
      this.id = `u${ticket.uid}`;
      this.userId = ticket.uid;
      this.name = ticket.name;
      this.level = ticket.lvl;
    } else {
      this.id = `anon${++anonCounter}${Math.random().toString(36).slice(2, 6)}`;
      this.userId = null;
      this.name = (anonName ?? `Pilote${anonCounter}`).replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 16) || `Pilote${anonCounter}`;
      this.level = 1;
    }
  }

  get connected(): boolean {
    return this.socket.readyState === this.socket.OPEN;
  }

  send(msg: ServerMessage): void {
    if (this.socket.readyState === this.socket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  /** Token bucket-ish limiter on inbound messages. Returns false when the client floods. */
  allowMessage(): boolean {
    const now = Date.now();
    if (now - this.msgWindowStart > 1000) {
      this.msgWindowStart = now;
      this.msgCount = 0;
    }
    this.msgCount++;
    return this.msgCount <= MAX_STATE_RATE + 10;
  }

  /** Upgrade levels for a vehicle, from the signed ticket (server truth at ticket time). */
  upgradesFor(vehicle: VehicleId): { engine: number; handling: number; boost: number; brakes: number } {
    const u = this.ticket?.veh?.[vehicle]?.u;
    return u ? { engine: u[0] ?? 0, handling: u[1] ?? 0, boost: u[2] ?? 0, brakes: u[3] ?? 0 } : { ...NO_UPGRADES };
  }

  /** A paint can be used if it is free, or if the ticket shows the player applied it in the garage (owned). */
  canUsePaint(vehicle: VehicleId, color: string, premium: boolean): boolean {
    if (!premium) return true;
    return Object.values(this.ticket?.veh ?? {}).some((v) => v.c === color) || this.ticket?.veh?.[vehicle]?.c === color;
  }

  close(code = 1000, reason = ''): void {
    try {
      this.socket.close(code, reason);
    } catch {
      /* already closed */
    }
  }
}
