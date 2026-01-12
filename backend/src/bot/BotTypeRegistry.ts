import { BaseBotInstance, BotTypeConfig, SetupStep } from './BaseBotInstance.js';

export interface BotTypeDefinition {
  type: string;
  name: string;
  description: string;
  icon: string;
  setupSteps: SetupStep[];
  // Factory function to create bot instance
  createInstance: (botId: string, userId: string) => BaseBotInstance;
}

/**
 * Registry for bot types.
 * All bot type plugins register themselves here.
 * This enables a modular, extensible architecture where new bot types
 * can be added without modifying core code.
 */
export class BotTypeRegistry {
  private static instance: BotTypeRegistry;
  private botTypes: Map<string, BotTypeDefinition> = new Map();

  private constructor() {}

  static getInstance(): BotTypeRegistry {
    if (!BotTypeRegistry.instance) {
      BotTypeRegistry.instance = new BotTypeRegistry();
    }
    return BotTypeRegistry.instance;
  }

  /**
   * Register a new bot type
   */
  register(definition: BotTypeDefinition): void {
    if (this.botTypes.has(definition.type)) {
      console.warn(`Bot type "${definition.type}" is already registered. Overwriting.`);
    }
    console.log(`[BotTypeRegistry] Registered bot type: ${definition.type}`);
    this.botTypes.set(definition.type, definition);
  }

  /**
   * Get a bot type definition by type ID
   */
  get(type: string): BotTypeDefinition | undefined {
    return this.botTypes.get(type);
  }

  /**
   * Get all registered bot types
   */
  getAll(): BotTypeDefinition[] {
    return Array.from(this.botTypes.values());
  }

  /**
   * Get all bot types as a simple array for API responses
   */
  getAllTypes(): Array<{
    type: string;
    name: string;
    description: string;
    icon: string;
    setupSteps: SetupStep[];
  }> {
    return this.getAll().map((def) => ({
      type: def.type,
      name: def.name,
      description: def.description,
      icon: def.icon,
      setupSteps: def.setupSteps,
    }));
  }

  /**
   * Create a bot instance of the specified type
   */
  createInstance(type: string, botId: string, userId: string): BaseBotInstance {
    const definition = this.botTypes.get(type);
    if (!definition) {
      throw new Error(`Unknown bot type: ${type}`);
    }
    return definition.createInstance(botId, userId);
  }

  /**
   * Check if a bot type is registered
   */
  has(type: string): boolean {
    return this.botTypes.has(type);
  }
}

// Export singleton instance
export const botTypeRegistry = BotTypeRegistry.getInstance();
