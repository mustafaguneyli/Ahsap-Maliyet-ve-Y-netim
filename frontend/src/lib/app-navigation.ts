export type CostSettingsGroup = 'door_frame' | 'PERVAZ' | 'SUPURGELIK' | 'CITA';

export type AppNavigation = {
  page:
    | 'materials'
    | 'yields'
    | 'cost-calculation'
    | 'price-list'
    | 'pricing'
    | 'audit'
    | 'orders'
    | 'door-build';
  costGroup?: CostSettingsGroup;
  openCostSettings?: boolean;
  materialSearch?: string;
};
