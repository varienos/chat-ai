export interface DependencyState {
  reason?: string;
  status: "down" | "up";
}

export interface HealthStatus {
  dependencies: Record<string, DependencyState>;
  status: "degraded" | "ok";
}

export interface ReadinessStatus {
  dependencies: Record<string, DependencyState>;
  status: "not_ready" | "ready";
}

export interface DependencyStatusService {
  getHealthStatus(): Promise<HealthStatus>;
  getReadinessStatus(): Promise<ReadinessStatus>;
}

interface RuntimeDependencyStatusServiceOptions {
  checkPostgres: () => Promise<void>;
  checkProviderAuth: () => Promise<Record<string, DependencyState>>;
  checkRedis: () => Promise<void>;
}

export class StaticDependencyStatusService implements DependencyStatusService {
  constructor(
    private readonly health: HealthStatus = {
      dependencies: {},
      status: "ok",
    },
    private readonly readiness: ReadinessStatus = {
      dependencies: {},
      status: "ready",
    },
  ) {}

  async getHealthStatus(): Promise<HealthStatus> {
    return this.health;
  }

  async getReadinessStatus(): Promise<ReadinessStatus> {
    return this.readiness;
  }
}

export class RuntimeDependencyStatusService implements DependencyStatusService {
  constructor(private readonly options: RuntimeDependencyStatusServiceOptions) {}

  async getHealthStatus(): Promise<HealthStatus> {
    const dependencies = await Promise.all([
      this.checkDependency("redis", this.options.checkRedis),
      this.checkDependency("postgres", this.options.checkPostgres),
    ]);

    return {
      dependencies: Object.fromEntries(dependencies),
      status: dependencies.some(([, state]) => state.status === "down")
        ? "degraded"
        : "ok",
    };
  }

  async getReadinessStatus(): Promise<ReadinessStatus> {
    const baseDependencies = await Promise.all([
      this.checkDependency("redis", this.options.checkRedis),
      this.checkDependency("postgres", this.options.checkPostgres),
    ]);
    const providerDependencies = Object.entries(
      await this.options.checkProviderAuth(),
    );
    const dependencies = [...baseDependencies, ...providerDependencies];

    return {
      dependencies: Object.fromEntries(dependencies),
      status: dependencies.some(([, state]) => state.status === "down")
        ? "not_ready"
        : "ready",
    };
  }

  private async checkDependency(
    name: string,
    fn: () => Promise<void>,
  ): Promise<[string, DependencyState]> {
    try {
      await fn();

      return [
        name,
        {
          status: "up",
        },
      ];
    } catch (error) {
      return [
        name,
        {
          reason: error instanceof Error ? error.message : "Unknown error",
          status: "down",
        },
      ];
    }
  }
}
