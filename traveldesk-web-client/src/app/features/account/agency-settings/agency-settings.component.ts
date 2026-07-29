import { Component, OnInit, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ReactiveFormsModule, FormBuilder, Validators } from "@angular/forms";
import { AuthService } from "../../../core/services/auth.service";
import { AccountService } from "../../../core/services/account.service";
import { AgencySettingsResponse } from "../../../core/models";

@Component({
  selector: "app-agency-settings",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="max-w-4xl mx-auto p-6">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-slate-900 dark:text-white">
          Configuración
        </h1>
        <p class="text-slate-600 dark:text-slate-400 mt-1">
          Administra tus preferencias
        </p>
      </div>

      <div
        class="bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 p-6"
      >
        <h2 class="text-lg font-semibold text-slate-900 dark:text-white mb-6">
          Moneda predeterminada
        </h2>

        @if (loadError()) {
          <div
            class="mb-4 rounded-lg border border-danger-300 bg-danger-50 dark:bg-danger-900/20 dark:border-danger-800 px-4 py-3 text-sm text-danger-700 dark:text-danger-300"
          >
            No se pudo cargar la configuración de la agencia. Recarga la página e inténtalo de nuevo.
          </div>
        }

        <form
          [formGroup]="settingsForm"
          (ngSubmit)="saveChanges()"
          class="space-y-4"
        >
          <div>
            <label
              class="block text-sm font-medium text-slate-900 dark:text-white mb-2"
            >
              Moneda
            </label>
            <select
              formControlName="currency"
              class="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-60"
            >
              <option value="USD">Dólar estadounidense (USD)</option>
              <option value="EUR">Euro (EUR)</option>
              <option value="GBP">Libra esterlina (GBP)</option>
              <option value="ARS">Peso argentino (ARS)</option>
            </select>
          </div>

          @if (saveError()) {
            <p class="text-sm text-danger-700 dark:text-danger-300">{{ saveError() }}</p>
          }
          @if (saved()) {
            <p class="text-sm text-success-700 dark:text-success-400">
              Cambios guardados correctamente.
            </p>
          }

          <div class="flex gap-3 pt-4">
            <button
              type="submit"
              [disabled]="isSaving() || isLoading() || settingsForm.invalid"
              class="px-6 py-2 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition disabled:opacity-60"
            >
              {{ isSaving() ? "Guardando..." : "Guardar cambios" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [],
})
export class AgencySettingsComponent implements OnInit {
  auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly account = inject(AccountService);

  isSaving = signal(false);
  isLoading = signal(true);
  saved = signal(false);
  saveError = signal<string | null>(null);
  loadError = signal(false);

  /** Se preservan al guardar: la pantalla solo edita la moneda. */
  private current: AgencySettingsResponse | null = null;

  settingsForm = this.fb.group({
    currency: ["USD", Validators.required],
  });

  ngOnInit() {
    this.account.getAgencySettings().subscribe({
      next: (settings) => {
        this.current = settings;
        this.settingsForm.patchValue({ currency: settings.currency });
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  saveChanges() {
    if (this.settingsForm.invalid || this.isSaving() || !this.current) {
      return;
    }
    this.saved.set(false);
    this.saveError.set(null);
    this.isSaving.set(true);

    this.account
      .updateAgencySettings({
        agencyName: this.current.agencyName,
        timeZone: this.current.timeZone,
        currency: this.settingsForm.value.currency ?? this.current.currency,
      })
      .subscribe({
        next: (updated) => {
          this.current = updated;
          this.saved.set(true);
          this.isSaving.set(false);
        },
        error: () => {
          this.saveError.set("No se pudieron guardar los cambios. Inténtalo de nuevo.");
          this.isSaving.set(false);
        },
      });
  }
}
