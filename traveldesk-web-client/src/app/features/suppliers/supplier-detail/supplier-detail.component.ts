import { Component, inject, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  FormGroup,
} from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { finalize } from "rxjs";
import { SuppliersService } from "../../../core/services/suppliers.service";
import { BookingsService } from "../../../core/services/bookings.service";
import {
  ServiceType,
  CreateSupplierDto,
  BookingResponse,
} from "../../../core/models";

@Component({
  selector: "app-supplier-detail",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: "./supplier-detail.component.html",
})
export class SupplierDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  suppliersSvc = inject(SuppliersService);
  bookingsSvc = inject(BookingsService);

  supplierId: string | null = null;
  isEditing = signal(false);
  isLoading = signal(true);
  isSaving = signal(false);
  errorMessage = signal("");
  successMessage = signal("");
  associatedBookings = signal<BookingResponse[]>([]);

  categories: ServiceType[] = [
    "AIRLINE",
    "AIR_CONSOLIDATOR",
    "BED_BANK",
    "TOUR_OPERATOR",
    "TRANSFER",
    "CRUISE",
    "FERRY",
    "TRAIN",
    "TICKET_PROVIDER",
    "LOCAL_TOUR_OPERATOR",
    "INSURANCE",
    "OTHER",
  ];

  serviceTypeLabels: Record<ServiceType, string> = {
    AIRLINE: "Aerolínea",
    AIR_CONSOLIDATOR: "Consolidador aéreo",
    BED_BANK: "Banco de camas",
    TOUR_OPERATOR: "Operador turístico",
    TRANSFER: "Traslado",
    CRUISE: "Crucero",
    FERRY: "Ferry",
    TRAIN: "Tren",
    TICKET_PROVIDER: "Proveedor de entradas",
    LOCAL_TOUR_OPERATOR: "Operador turístico local",
    INSURANCE: "Seguro",
    OTHER: "Otro",
  };

  form: FormGroup = this.fb.group({
    name: ["", [Validators.required]],
    serviceType: ["AIRLINE", [Validators.required]],
    currency: ["USD", [Validators.required]],
    email: ["", [Validators.email]],
    phone: [""],
    country: [""],
  });

  ngOnInit() {
    this.route.params.subscribe((params) => {
      this.supplierId = params["id"]; // Mantener como string (UUID)
      this.loadSupplier();
    });
  }

  loadSupplier() {
    if (!this.supplierId) return;

    this.suppliersSvc.getById(this.supplierId).subscribe({
      next: (supplier) => {
        this.form.patchValue(supplier);
        this.loadAssociatedBookings();
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error("Error al cargar proveedor:", err);
        this.errorMessage.set("Proveedor no encontrado");
        this.isLoading.set(false);
      },
    });
  }

  loadAssociatedBookings() {
    // Cargar todas las reservas y filtrar las que usan este proveedor
    const bookings = this.bookingsSvc.bookings();
    const filtered = bookings.filter((b) => b.supplierId === this.supplierId);
    this.associatedBookings.set(filtered);
  }

  save() {
    if (!this.supplierId || this.isSaving()) return;

    this.errorMessage.set("");
    this.successMessage.set("");

    if (this.form.invalid) {
      Object.keys(this.form.controls).forEach((key) => {
        const control = this.form.get(key);
        if (control?.errors) {
          console.log(`Error en ${key}:`, control.errors);
        }
      });
      this.form.markAllAsTouched();
      this.errorMessage.set(
        "Por favor completa todos los campos correctamente",
      );
      return;
    }

    const formData = this.form.getRawValue() as CreateSupplierDto;
    console.log("Datos a actualizar:", formData);

    this.isSaving.set(true);

    this.suppliersSvc
      .update(this.supplierId, formData)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (response) => {
          console.log("Proveedor actualizado exitosamente:", response);
          this.successMessage.set("Proveedor actualizado exitosamente");
          this.isEditing.set(false);

          setTimeout(() => this.successMessage.set(""), 3000);
        },
        error: (err) => {
          console.error("Error al actualizar proveedor:", err);
          const errorMsg =
            err?.error?.message || "Error al actualizar el proveedor";
          this.errorMessage.set(errorMsg);
        },
      });
  }

  cancel() {
    this.isEditing.set(false);
    this.errorMessage.set("");
    this.successMessage.set("");
    this.loadSupplier();
  }

  goBack() {
    this.router.navigate(["/app/suppliers"]);
  }

  catGradient(serviceType: ServiceType): string {
    const map: Partial<Record<ServiceType, string>> = {
      AIRLINE: "bg-gradient-to-br from-cyan-500 to-teal-600",
      AIR_CONSOLIDATOR: "bg-gradient-to-br from-cyan-500 to-teal-600",
      BED_BANK: "bg-gradient-to-br from-indigo-500 to-blue-600",
      TOUR_OPERATOR: "bg-gradient-to-br from-emerald-500 to-green-600",
      TRANSFER: "bg-gradient-to-br from-warning-500 to-orange-600",
      CRUISE: "bg-gradient-to-br from-blue-500 to-cyan-600",
      FERRY: "bg-gradient-to-br from-blue-500 to-cyan-600",
      TRAIN: "bg-gradient-to-br from-orange-500 to-warning-600",
      TICKET_PROVIDER: "bg-gradient-to-br from-fuchsia-500 to-pink-600",
      LOCAL_TOUR_OPERATOR: "bg-gradient-to-br from-emerald-500 to-lime-600",
      INSURANCE: "bg-gradient-to-br from-rose-500 to-pink-600",
      OTHER: "bg-gradient-to-br from-slate-500 to-slate-600",
    };
    return map[serviceType] ?? map.OTHER!;
  }

  getServiceTypeLabel(serviceType: any): string {
    return this.serviceTypeLabels[serviceType as ServiceType] || "Otro";
  }
}
