export class PlanLimitError extends Error {
  readonly code = "PLAN_LIMIT_EXCEEDED";
  constructor(message: string) {
    super(message);
    this.name = "PlanLimitError";
  }
}

export class PlanFeatureError extends Error {
  readonly code = "PLAN_FEATURE_NOT_INCLUDED";
  constructor(message: string) {
    super(message);
    this.name = "PlanFeatureError";
  }
}
