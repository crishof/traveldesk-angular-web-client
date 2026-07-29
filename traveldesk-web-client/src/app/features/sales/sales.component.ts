import { Component, inject, signal, computed, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  FormsModule,
} from "@angular/forms";
import { Router } from "@angular/router";
import { finalize } from "rxjs";
import { SalesService } from "../../core/services/sales.service";
import { ClientsService } from "../../core/services/clients.service";
import { TeamService } from "../../core/services/team.service";
import { AuthService } from "../../core/services/auth.service";
import { SaleRequest } from "../../core/models";
import { ClearZeroOnFocusDirective } from "../../shared/directives/clear-zero-on-focus.directive";
import {
  getSaleClientName,
  getSaleTotalAmount,
  getSaleTravelDate,
} from "../../core/models/domain-helpers";

interface CustomerOption {
  id: string;
  fullName: string;
}

@Component({
  selector: "app-sales",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, ClearZeroOnFocusDirective],
  templateUrl: "./sales.component.html",
})
export class SalesComponent implements OnInit {
  private readonly pendingCustomerId = "__pending_new_customer__";

  salesSvc = inject(SalesService);
  clientsSvc = inject(ClientsService);
  teamSvc = inject(TeamService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly isAdmin = this.auth.isAdmin;
  readonly visibleSales = this.salesSvc.visibleSales;

  showNewSale = signal(false);
  creatingSale = signal(false);
  customerSearch = signal("");
  pendingNewCustomerName = signal("");

  saleStatuses: string[] = ["CREATED", "CONFIRMED", "CANCELLED"];

  saleForm = this.fb.group({
    clientId: ["", Validators.required],
    destination: ["", Validators.required],
    travelDate: ["", Validators.required],
    description: [""],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    currency: ["USD", Validators.required],
  });



  filteredCustomers = computed(() => {
    const term = this.customerSearch().trim().toLowerCase();
    if (!term) return this.clientsSvc.clients();

    return this.clientsSvc
      .clients()
      .filter((c) => c.fullName.toLowerCase().includes(term));
  });

  customerOptions = computed<CustomerOption[]>(() => {
    const options = this.filteredCustomers().map((c) => ({
      id: c.id,
      fullName: c.fullName,
    }));

    const pendingName = this.pendingNewCustomerName().trim();
    if (!pendingName) return options;

    return [
      { id: this.pendingCustomerId, fullName: `${pendingName} (nuevo)` },
      ...options,
    ];
  });

  ngOnInit() {
    this.salesSvc.loadAll().subscribe();
    this.clientsSvc.loadAll().subscribe();
    this.teamSvc.loadAll().subscribe();
  }

  openNewSaleModal() {
    this.showNewSale.set(true);
    this.saleForm.patchValue({ clientId: "" });
  }

  openSaleDetails(saleId: string) {
    this.router.navigate(["/app/sales", saleId]);
  }

  createSale() {
    if (this.saleForm.invalid || this.creatingSale()) {
      this.saleForm.markAllAsTouched();
      return;
    }

    const v = this.saleForm.value;
    const pendingName =
      this.pendingNewCustomerName().trim() || this.customerSearch().trim();

    const dto: SaleRequest = {
      ...(v.clientId === this.pendingCustomerId
        ? { customerName: pendingName }
        : { customerId: v.clientId! }),
      agentId: this.auth.currentUser()?.id,
      destination: v.destination!,
      departureDate: v.travelDate!,
      createdAt: new Date().toISOString(),
      description: (v.description ?? "").trim(),
      amount: Number(v.amount),
      currency: v.currency! as "USD" | "EUR",
      status: "CREATED",
    };

    this.creatingSale.set(true);

    this.salesSvc
      .create(dto)
      .pipe(finalize(() => this.creatingSale.set(false)))
      .subscribe({
        next: (sale) => {
          this.showNewSale.set(false);
          this.saleForm.reset({
            clientId: "",
            destination: "",
            travelDate: "",
            description: "",
            amount: null,
            currency: "USD",
          });
          this.customerSearch.set("");
          this.pendingNewCustomerName.set("");
          void this.router.navigate(["/app/sales", sale.id]);
        },
        error: (err) => console.error("Error creating sale:", err),
      });
  }



  onCustomerSearchInput(event: Event) {
    const typedValue = this.getVal(event);
    const typedName = typedValue.trim();

    this.customerSearch.set(typedValue);

    if (!typedName) {
      this.pendingNewCustomerName.set("");
      this.saleForm.patchValue({ clientId: "" });
      return;
    }

    const exactMatch = this.clientsSvc
      .clients()
      .find((c) => c.fullName.trim().toLowerCase() === typedName.toLowerCase());

    if (exactMatch) {
      this.pendingNewCustomerName.set("");
      this.saleForm.patchValue({ clientId: exactMatch.id });
      return;
    }

    const firstMatch = this.filteredCustomers()[0];
    if (firstMatch) {
      this.pendingNewCustomerName.set("");
      this.saleForm.patchValue({ clientId: firstMatch.id });
      return;
    }

    // Si no hay coincidencias, tratamos el texto ingresado como cliente nuevo.
    this.pendingNewCustomerName.set(typedName);
    this.saleForm.patchValue({ clientId: this.pendingCustomerId });
  }

  getVal(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  getSaleClientName = getSaleClientName;
  getSaleTravelDate = getSaleTravelDate;

  formatSaleAmount(sale: { totalAmount?: number; amount?: number; currency?: "USD" | "EUR" }): string {
    return `${sale.currency ?? "USD"} ${getSaleTotalAmount(sale).toFixed(2)}`;
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      CREATED: "bg-warning-500/10 text-warning-500",
      CONFIRMED: "bg-success-500/10 text-success-500",
      CANCELLED: "bg-danger-500/10 text-danger-500",
    };
    return map[status] ?? "";
  }

  statusDot(status: string): string {
    const map: Record<string, string> = {
      CREATED: "bg-warning-500",
      CONFIRMED: "bg-success-500",
      CANCELLED: "bg-danger-500",
    };
    return map[status] ?? "";
  }
}
