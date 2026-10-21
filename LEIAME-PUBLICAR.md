# Publicar a Banca de Palha (GitHub + Supabase + iPhone)

O front-end (pasta `public`) vai para o **GitHub Pages**. Os dados ficam no **Supabase**. Não há login por enquanto.

## 1. Supabase (o banco)

1. Crie um projeto em supabase.com.
2. Abra **SQL Editor**, cole o conteúdo de `supabase.sql` e clique em **Run**.
3. Abra **Project Settings > API** e copie:
   - **Project URL**
   - a chave **anon / publishable** (a pública). **Nunca** use a `service_role`.
4. Abra `public/js/config.js` e preencha `supabaseUrl` e `supabaseKey`.

## 2. GitHub (o site)

1. Crie um repositório no GitHub e envie **a pasta inteira** do programa (o `.gitignore` já deixa a pasta `dados` de fora).
2. No repositório: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. A cada envio para a branch `main`, o arquivo `.github/workflows/pages.yml` publica o conteúdo de `public`.
4. O endereço fica `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## 3. No iPhone

O iOS **não instala PWA sozinho**: a pessoa precisa fazer isso uma vez, no **Safari**.

1. Abra o endereço do site no Safari.
2. Toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.
3. Abra pelo ícone da tela inicial: roda em tela cheia, como app.

Enquanto estiver aberto no Safari (e não instalado), o programa mostra um aviso com esses passos. Ele some ao tocar em "Entendi" ou depois de instalado.

Sem internet, o app abre e mostra os últimos dados que o aparelho guardou, **só para consulta**. Para registrar, precisa de internet.

## Atenção: segurança

Sem login, **qualquer pessoa que tiver o endereço do site e achar a chave no `config.js` consegue ler e alterar todos os dados**, que incluem valores a pagar e a receber. O que já protege: as tabelas ficam fechadas e o acesso passa só por duas funções (`ler_banco` e `salvar_banco`). Mas isso não substitui login.

Enquanto não houver autenticação:
- não divulgue o endereço;
- prefira um repositório **privado** (o GitHub Pages em repositório privado exige plano pago);
- o Supabase guarda uma cópia do dia na tabela `banco_copias`.

## Rodar no computador (como antes)

`iniciar.bat` continua funcionando. Com `config.js` preenchido, o programa usa o Supabase mesmo no computador.

## Atualizar o app instalado

Envie a mudança ao GitHub. O app busca a versão nova ao abrir (se continuar com a tela antiga, feche-o por completo e abra de novo).
