export interface PosActor {
  userId: string;
  userRole: string;
}

export function puedeOperarTurno(actor: PosActor, turno: { usuario_id: string }) {
  return actor.userRole === "admin" || turno.usuario_id === actor.userId;
}

export function puedeAdministrarPOS(actor: Pick<PosActor, "userRole">) {
  return actor.userRole === "admin";
}

export function puedeOperarDianPOS(actor: { userRole: string; userDian?: boolean }) {
  return actor.userRole === "admin" || actor.userRole === "vendedor" || (actor.userRole === "contador" && actor.userDian === true);
}
