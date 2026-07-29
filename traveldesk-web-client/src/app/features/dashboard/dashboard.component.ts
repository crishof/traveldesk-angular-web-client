import { CommonModule } from "@angular/common";
import { Component, computed, inject, OnInit } from "@angular/core";
import { RouterLink } from "@angular/router";
import { BookingsService } from "../../core/services/bookings.service";
import { AuthService } from "../../core/services/auth.service";
import {
  getBookingDescription,
  getBookingProvider,
  getBookingReservationCode,
  getSaleClientName,
  getSaleCreatedAt,
  getSaleCurrency,
  getSalePaymentsTotal,
  getSaleTotalAmount,
  getSaleTravelDate,
} from "../../core/models/domain-helpers";
import { SaleResponse } from "../../core/models";
import { SalesService } from "../../core/services/sales.service";
import { VisibilityModeService } from "../../core/services/visibility-mode.service";

type CurrencyTotals = { EUR: number; USD: number };

@Component({
  selector: "app-dashboard",
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: "./dashboard.component.html",
})
export class DashboardComponent implements OnInit {
  private readonly salesSvc = inject(SalesService);
  private readonly bookingsSvc = inject(BookingsService);
  private readonly auth = inject(AuthService);
  readonly visibility = inject(VisibilityModeService);

  readonly firstName = computed(
    () => this.auth.currentUser()?.fullName?.split(" ")[0] ?? "",
  );

  readonly isAdmin = this.auth.isAdmin;
  readonly visibleSales = this.salesSvc.visibleSales;

  readonly activeSales = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.visibleSales()
      .filter((sale) => getSaleTravelDate(sale) > today)
      .sort((left, right) =>
        getSaleTravelDate(left).localeCompare(getSaleTravelDate(right)),
      );
  });

  readonly registeredClients = computed(() => {
    const uniqueIds = new Set(
      this.visibleSales()
        .map((sale) => sale.clientId ?? sale.customerId)
        .filter(Boolean),
    );
    return uniqueIds.size;
  });

  readonly pendingByCurrency = computed(() => {
    const totals: CurrencyTotals = { EUR: 0, USD: 0 };

    for (const sale of this.visibleSales()) {
      const currency = getSaleCurrency(sale);
      const pending = getSaleTotalAmount(sale) - getSalePaymentsTotal(sale);
      if (pending > 0) {
        totals[currency] += pending;
      }
    }

    return totals;
  });

  readonly revenueByCurrency = computed(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = cutoff.toISOString();
    const totals: CurrencyTotals = { EUR: 0, USD: 0 };

    for (const sale of this.visibleSales()) {
      const createdAt = getSaleCreatedAt(sale);
      if (!createdAt) continue;

      const saleDate = new Date(createdAt);
      if (Number.isNaN(saleDate.getTime()) || saleDate.toISOString() < cutoffIso) {
        continue;
      }

      const currency = getSaleCurrency(sale);
      totals[currency] += getSaleTotalAmount(sale);
    }

    return totals;
  });

  readonly recentSales = computed(() =>
    [...this.visibleSales()]
      .sort((left, right) =>
        getSaleCreatedAt(right).localeCompare(getSaleCreatedAt(left)),
      )
      .slice(0, 5),
  );

  readonly pendingBookings = computed(() => {
    const visibleCustomerIds = new Set(
      this.visibleSales().map((sale) => sale.customerId ?? sale.clientId).filter(Boolean),
    );

    return this.bookingsSvc
      .bookings()
      .filter(
        (booking) =>
          booking.status !== "PAID" &&
          (booking.customerId ? visibleCustomerIds.has(booking.customerId) : true),
      )
      .sort((left, right) => {
        const leftDate = left.departureDate ?? "";
        const rightDate = right.departureDate ?? "";
        return rightDate.localeCompare(leftDate);
      })
      .slice(0, 5);
  });

  ngOnInit() {
    this.salesSvc.loadAll().subscribe();
    this.bookingsSvc.loadAll().subscribe();
  }

  setVisibilityMode(checked: boolean) {
    this.visibility.setMode(checked ? "ALL_USERS" : "MY_DATA");
  }

  getSaleClientName = getSaleClientName;
  getSaleTravelDate = getSaleTravelDate;
  getSaleCreatedAt = getSaleCreatedAt;
  getBookingDescription = getBookingDescription;
  getBookingProvider = getBookingProvider;
  getBookingReservationCode = getBookingReservationCode;

  formatAmount(amount: number, currency: string): string {
    return `${currency} ${Number(amount ?? 0).toFixed(2)}`;
  }

  getSaleAmount(sale: SaleResponse): number {
    return getSaleTotalAmount(sale);
  }

  getPendingTotal(currency: "EUR" | "USD"): number {
    return this.pendingByCurrency()[currency];
  }

  getRevenueTotal(currency: "EUR" | "USD"): number {
    return this.revenueByCurrency()[currency];
  }

  formatSaleCardAmount(sale: SaleResponse): string {
    return `${sale.currency} ${getSaleTotalAmount(sale).toFixed(2)}`;
  }

  saleStatusClass(status: string): string {
    const map: Record<string, string> = {
      CREATED: "bg-warning-500/10 text-warning-600",
      CONFIRMED: "bg-success-500/10 text-success-600",
      CANCELLED: "bg-danger-500/10 text-danger-500",
    };

    return map[status] ?? "bg-slate-500/10 text-slate-500";
  }

  bookingStatusClass(status: string): string {
    const map: Record<string, string> = {
      CREATED: "bg-warning-500/10 text-warning-600",
      CONFIRMED: "bg-blue-500/10 text-blue-600",
      PAID: "bg-success-500/10 text-success-600",
    };

    return map[status] ?? "bg-slate-500/10 text-slate-500";
  }
}
