export interface PackageResponse {
  id: string;
  name: string;
  description: string | null;
  classesPerPeriod: number | null;
  classDurationMin: number | null;
  billingPeriod: string;
  price: number;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItemResponse {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceResponse {
  id: string;
  invoiceNumber: string;
  studentId: string;
  parentId: string | null;
  enrollmentId: string;
  packageId: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  issuedAt: Date;
  dueAt: Date;
  paidAt: Date | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: InvoiceItemResponse[];
}

export interface PaymentResponse {
  id: string;
  invoiceId: string;
  studentId: string;
  parentId: string | null;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
}
