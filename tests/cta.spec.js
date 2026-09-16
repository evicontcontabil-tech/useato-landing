// @ts-check
/**
 * OS CINCO CTAs: O EVENTO SAI, E A NAVEGAÇÃO ACONTECE.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE. `IniciouCadastro` é a ÚNICA métrica que separa duas conversas
 * completamente diferentes: "quem clica no CTA chega na tela de cadastro" (o gargalo é a mensagem
 * da página) e "gente se perde entre o clique e a tela" (o gargalo é técnico). Sem ela, um número
 * baixo de cadastros admite as duas leituras, e elas levam a decisões opostas.
 *
 * ⚠️ E A PERDA É SILENCIOSA NOS DOIS SENTIDOS. Tirar `data-cta="trial"` de um botão NÃO quebra
 * nada: ele continua levando ao cadastro, e só o evento some — descobre-se semanas depois, quando
 * o relatório não fecha. Quebrar o `href` também não estoura: o evento continua saindo, e some a
 * conversão. Por isso os dois lados são verificados no mesmo caso.
 *
 * ⚠️ O `fbq` É DUBLADO, não mockado por dentro: o que se testa é o CONTRATO com o pixel — o nome
 * do evento e a `origem` que vai junto. Um teste que chamasse o handler direto passaria com o
 * atributo removido do HTML, que é justamente o defeito.
 *
 * ⚠️ A NAVEGAÇÃO É CUMPRIDA (`fulfill`), NUNCA ABORTADA. Requisição abortada vira página de erro
 * do Chromium, e ler qualquer coisa nela estoura — vermelho por artefato do teste, que é como se
 * aprende a ignorar o vermelho.
 */

const { test, expect } = require('@playwright/test');
const path = require('node:path');

const PAGINA = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

/* As cinco origens declaradas nos CTAs. Um CTA novo nasce com `data-cta="trial"` e entra aqui —
   e é o caso `todo CTA da página está coberto` que cobra isso de quem esquecer. */
const ORIGENS = ['nav', 'hero', 'preco', 'cta-final', 'rodape'];

/** Dubla o `fbq` e entrega cada evento ao Node — o binding sobrevive à navegação. */
async function prepararPagina(page, eventos) {
  await page.exposeFunction('__registrarEvento', (nome, dados) => { eventos.push({ nome, dados }); });
  await page.addInitScript(() => {
    window.fbq = function (tipo, nome, dados) { window.__registrarEvento(nome, dados || null); };
  });
  /* O destino real não é assunto deste teste — e sem isto o CI dependeria do app estar no ar. */
  await page.route('**app.useato.com.br/**', (rota) =>
    rota.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>cadastro</body></html>' }));
}

test.describe('CTAs da landing', () => {
  for (const origem of ORIGENS) {
    test(`${origem}: emite IniciouCadastro e navega para o cadastro`, async ({ page }) => {
      const eventos = [];
      await prepararPagina(page, eventos);
      await page.goto(PAGINA);

      const cta = page.locator(`[data-cta="trial"][data-origem="${origem}"]`);
      await expect(cta).toHaveCount(1);

      /* ⚠️ O HREF É CONFERIDO NO ATRIBUTO, antes do clique: depois da navegação a URL já foi
         cumprida pelo dublê, e `page.url()` diria o que o teste mandou dizer. */
      await expect(cta).toHaveAttribute('href', 'https://app.useato.com.br/cadastro');

      await cta.click();
      await page.waitForURL(/app\.useato\.com\.br\/cadastro/);

      const iniciou = eventos.filter((e) => e.nome === 'IniciouCadastro');
      expect(iniciou).toHaveLength(1);
      expect(iniciou[0].dados).toMatchObject({ origem });
    });
  }

  test('⚠️ TODO CTA da página está coberto — um novo não pode nascer sem caso', async ({ page }) => {
    /* Sem isto, acrescentar um sexto CTA passaria despercebido: os cinco casos acima continuariam
       verdes, e o botão novo ficaria sem prova de que emite evento. */
    await page.goto(PAGINA);
    const origens = await page.locator('[data-cta="trial"]').evaluateAll(
      (els) => els.map((e) => e.dataset.origem));
    expect(origens.sort()).toEqual([...ORIGENS].sort());
  });

  test('o clique NÃO estoura quando o `fbq` não existe', async ({ page }) => {
    /* ⚠️ O `fbq` É APAGADO DEPOIS DA CARGA, e isto custou uma medição para acertar: simplesmente
       NÃO dublar o pixel não modela nada, porque o snippet do Facebook é INLINE e define `fbq`
       como um stub de fila mesmo quando o `fbevents.js` não carrega. A primeira versão deste caso
       saiu VERDE com a guarda removida (medido) — ela testava uma situação que a página nunca
       produz. O que a guarda protege de verdade é o snippet inteiro não ter rodado: CSP barrando
       inline, ou um erro de JS anterior na página.

       Sem `typeof fbq !== 'function'` no handler, o clique estoura — e o rastreamento derruba a
       conversão que ele existe para medir. */
    const erros = [];
    page.on('pageerror', (e) => erros.push(e.message));
    await page.route('**app.useato.com.br/**', (rota) =>
      rota.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>cadastro</body></html>' }));
    await page.goto(PAGINA);
    await page.evaluate(() => { delete window.fbq; });

    await page.locator('[data-cta="trial"][data-origem="hero"]').click();
    await page.waitForURL(/app\.useato\.com\.br\/cadastro/);
    expect(erros).toEqual([]);
  });

  test('PageView sai no carregamento', async ({ page }) => {
    const eventos = [];
    await prepararPagina(page, eventos);
    await page.goto(PAGINA);
    /* UM, e não dois: o pixel colado duas vezes dobra toda a contagem da conta. */
    expect(eventos.filter((e) => e.nome === 'PageView')).toHaveLength(1);
  });
});
