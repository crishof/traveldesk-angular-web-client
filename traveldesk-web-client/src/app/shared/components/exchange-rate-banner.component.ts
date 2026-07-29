import { CommonModule } from "@angular/common";
import { Component, computed, inject, OnInit, signal } from "@angular/core";
import { DisplayCurrencyService } from "../../core/services/display-currency.service";
import { ExchangeRateService } from "../../core/services/exchange-rate.service";

@Component({
  selector: "app-exchange-rate-banner",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative">
      <div class="md:hidden flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 px-2 py-1">
        <button
          type="button"
          (click)="toggleDirection()"
          title="Invertir conversión"
          class="px-1 py-0.5 rounded text-slate-500 hover:text-cyan-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm leading-none"
        >
          ⇄
        </button>
        <span class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">1 {{ fromCurrency() }}</span>
        <span class="text-[11px] text-slate-500 dark:text-slate-400">=</span>
        <span class="text-[11px] font-bold text-slate-900 dark:text-white tabular-nums">{{ pairRateDisplay() }}</span>
        <span class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{{ toCurrency() }}</span>
      </div>

      <div class="hidden md:flex items-center gap-3">
      <div class="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          step="any"
          [value]="convertAmountStr()"
          (input)="convertAmountStr.set($any($event.target).value)"
          class="w-16 px-2 py-1 rounded-lg text-sm text-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
        />
        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">{{ fromCurrency() }}</span>

        <button
          type="button"
          (click)="toggleDirection()"
          title="Invertir conversión"
          class="px-1.5 py-1 rounded-lg text-slate-500 hover:text-cyan-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-base leading-none"
        >
          ⇄
        </button>

        <span class="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
          {{ convertedResult() | number: "1.2-2" }}
        </span>
        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">{{ toCurrency() }}</span>
      </div>

      <div class="w-px h-5 bg-slate-200 dark:bg-slate-700"></div>

      <div class="flex items-center gap-1.5">
        <span class="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
          1 {{ fromCurrency() }} = {{ pairRateDisplay() }} {{ toCurrency() }}
        </span>
        @if (xr.isManual()) {
          <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-warning-500/15 text-warning-500 font-semibold">Manual</span>
          <button
            type="button"
            (click)="clearManualRate()"
            class="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 hover:text-danger-500 dark:text-slate-400 transition-colors"
          >
            Reset
          </button>
        }
        <button
          type="button"
          (click)="toggleManualInput()"
          class="text-xs px-2.5 py-1 rounded-lg transition-colors"
          [class]="showManualInput() ? 'bg-cyan-500/15 text-cyan-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'"
        >
          {{ showManualInput() ? "Cancelar" : "Tasa manual" }}
        </button>
      </div>
      </div>

      @if (showManualInput()) {
        <div class="absolute top-full right-0 mt-2 p-3 rounded-xl shadow-xl border z-50 bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700">
          <p class="text-xs text-slate-500 dark:text-slate-400 mb-2">1 {{ fromCurrency() }} = ? {{ toCurrency() }}</p>
          <div class="flex items-center gap-2">
            <input
              type="number"
              step="0.0001"
              min="0"
              [value]="manualRateInput()"
              (input)="manualRateInput.set($any($event.target).value)"
              placeholder="Ej: 1.08"
              class="w-24 px-2 py-1.5 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              (click)="applyManualRate()"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ExchangeRateBannerComponent implements OnInit {
  readonly xr = inject(ExchangeRateService);
  readonly displayCurrency = inject(DisplayCurrencyService);

  readonly convertAmountStr = signal("1");
  readonly showManualInput = signal(false);
  readonly manualRateInput = signal("");
  readonly pairRate = signal(1.08);

  readonly fromCurrency = computed(() =>
    this.displayCurrency.currency() === "USD" ? "EUR" : "USD",
  );
  readonly toCurrency = computed(() => this.displayCurrency.currency());
  readonly pairRateDisplay = computed(() => this.pairRate().toFixed(2));
  readonly convertedResult = computed(() => {
    const amount = Number.parseFloat(this.convertAmountStr()) || 0;
    return amount * this.pairRate();
  });

  ngOnInit() {
    this.refreshRate();
  }

  toggleDirection() {
    this.displayCurrency.toggle();
    this.refreshRate();
  }

  toggleManualInput() {
    const next = !this.showManualInput();
    this.showManualInput.set(next);
    this.manualRateInput.set(next ? this.pairRate().toFixed(4) : "");
  }

  applyManualRate() {
    const rate = Number.parseFloat(this.manualRateInput());
    if (Number.isNaN(rate) || rate <= 0) return;

    this.xr.setManualRate(rate, this.fromCurrency(), this.toCurrency());
    this.pairRate.set(rate);
    this.showManualInput.set(false);
    this.manualRateInput.set("");
  }

  clearManualRate() {
    this.xr.clearManual();
    this.manualRateInput.set("");
    this.refreshRate();
  }

  private refreshRate() {
    if (this.xr.isManual()) {
      this.pairRate.set(this.xr.getRateForPair(this.fromCurrency(), this.toCurrency()));
      return;
    }

    this.xr.getPairRate(this.fromCurrency(), this.toCurrency()).subscribe({
      next: (rate) => this.pairRate.set(rate),
      error: () => undefined,
    });
  }
}