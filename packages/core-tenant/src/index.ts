export interface Operator {
  id: string;
  name: string;
  brandIds: string[];
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
}

export interface Brand {
  id: string;
  operatorId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
}

export interface TenantContext {
  operator: Operator;
  brand?: Brand;
}
