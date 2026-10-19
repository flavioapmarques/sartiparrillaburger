# Sarti Parrilla Burger - PDV

Sistema de vendas (PDV) para restaurante pequeno. Desenvolvido por Flavio Marques. React + TypeScript + Vite, Tailwind CSS, Supabase e Netlify.

Telas: **Vender** (PDV), **Pedidos** (histórico), **Produtos** e **Clientes**.

---

## 1. Criar o projeto no Supabase

1. Acesse https://supabase.com, crie uma conta e clique em **New project**.
2. Escolha um nome (ex.: `pdv-restaurante`), defina uma senha do banco (guarde-a) e a região mais próxima (ex.: South America - São Paulo).
3. Quando o projeto terminar de criar, abra **SQL Editor > New query**.
4. Abra o arquivo `supabase/migrations/001_init.sql`, copie **todo** o conteúdo, cole no editor e clique em **Run**. Deve aparecer "Success". Isso cria as tabelas, a função que grava pedidos, as regras de segurança (RLS) e o espaço para imagens.
5. Ainda no **SQL Editor**, abra uma nova query e rode também o arquivo `supabase/migrations/002_acrescimo_e_impressao.sql` (depois do 001). Ele acrescenta o campo de acréscimo nos itens e o telefone do cliente no pedido.
5a. Rode também `supabase/migrations/003_categorias_taxa_obs.sql`, nessa ordem (001, 002, 003). Ele cria as categorias com ícone (aproveitando as que você já digitou nos produtos), a taxa de entrega e a observação por produto.
5b. Crie o usuário de acesso ao sistema: **Authentication > Users > Add user > Create new user**. Informe e-mail e senha e marque **Auto Confirm User**. Esse é o login do atendente.
6. Impeça que estranhos criem conta: **Authentication > Sign In / Providers** (ou *Settings*) e desative **Allow new users to sign up**.
7. Copie as chaves em **Project Settings > API**:
   - **Project URL**
   - **anon public** (também chamada *publishable*)

> Nunca use a chave `service_role` neste projeto, nem a coloque no GitHub ou no Netlify.

## 2. Executar localmente

1. Instale o Node.js (versão LTS) em https://nodejs.org.
2. Na pasta do projeto, abra o terminal e rode:
   ```
   npm install
   ```
3. Copie `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon
   ```
4. Rode `npm run dev` e abra o endereço mostrado (normalmente http://localhost:5173).
5. Entre com o e-mail e a senha criados no passo 5 do Supabase.

## 3. Subir para o GitHub

1. Crie um repositório vazio em https://github.com/new (pode ser privado).
2. No terminal, dentro da pasta do projeto:
   ```
   git init
   git add .
   git commit -m "Primeira versão do PDV"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```
   O arquivo `.env` não é enviado (está no `.gitignore`).

## 4. Publicar no Netlify

1. Em https://app.netlify.com clique em **Add new site > Import an existing project > GitHub** e escolha o repositório.
2. As configurações de build já vêm do arquivo `netlify.toml` (comando `npm run build`, pasta `dist`).
3. Antes de publicar, em **Site configuration > Environment variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os mesmos valores do `.env`.
4. Clique em **Deploy**. A cada `git push`, o Netlify publica de novo automaticamente.
5. Se você alterar as variáveis depois, faça **Deploys > Trigger deploy** para aplicar.

## 5. Primeiros produtos e primeira venda

1. Entre no sistema e abra **Produtos > Categorias** para criar as categorias (ex.: Lanches, Bebidas, Porções, Acréscimo) e escolher o ícone de cada uma.
2. Em **Novo produto**, preencha nome, categoria e preço (ex.: `18,50`). Imagem e descrição são opcionais. Cadastre alguns produtos de cada categoria.
3. (Opcional) Cadastre clientes em **Clientes**.
4. Abra **Vender**, toque nos produtos para adicioná-los ao pedido, ajuste quantidades e toque em **Finalizar pedido**.
5. Escolha Retirada ou Entrega (entrega exige endereço), a forma de pagamento e confirme.
6. Consulte as vendas em **Pedidos** (por dia, número ou nome do cliente).

Para tirar um produto da tela de vendas sem apagá-lo, use o botão de ligar/desligar na lista de produtos.

## Categorias com ícone

Em **Produtos > Categorias** você cria, edita, exclui e ordena as categorias, e escolhe o ícone de cada uma. Na tela **Vender** elas aparecem como ícones (a selecionada mostra também o nome) e a tela abre sempre em **Lanches**; **Todos** fica por último. Ao pesquisar um produto pelo nome, a busca vale para todas as categorias.

Nos produtos, a categoria agora é escolhida numa lista.

## Acréscimos, observações e taxa de entrega

- **Acréscimo:** cadastre os acréscimos como produtos na categoria **Acréscimo** (ex.: Bacon extra, Queijo extra). Eles não aparecem na grade de vendas: só no botão **Acréscimo** de cada item do pedido, onde você escolhe um ou mais (com quantidade). O valor soma por unidade: subtotal = (preço + acréscimos) x quantidade. Se o item tem 2 unidades e só uma leva acréscimo, escolha "1 de 2" e a linha se separa sozinha.
- **Obs:** o botão **Obs** de cada item aceita texto livre (ex.: sem cebola, coca com gelo) e tem atalhos rápidos. A observação sai na via da chapa e no histórico.
- **Taxa de entrega:** ao escolher Entrega na finalização, aparece o campo da taxa. Ela entra no total do pedido e é impressa na via do motoboy.
- **Quantidade:** na grade de produtos, depois de adicionar um item aparecem os botões **-** e **+** no próprio cartão do produto.

## Impressão em bobina

Depois de confirmar a venda (ou em **Pedidos > pedido > Imprimir pedido**) abre a tela de impressão com:

- **Via da chapa:** número do pedido, tipo, cliente, itens e acréscimos, sem preços.
- **Via do motoboy** (entrega) ou **Comprovante** (retirada): cliente, telefone, endereço, itens com valores, total, pagamento e troco.
- **As duas vias:** cada via sai em uma página, para a guilhotina cortar entre elas.

Escolha a largura da bobina (80 mm ou 58 mm; o sistema lembra a escolha). Na janela de impressão do navegador, selecione a impressora da bobina e desative "Cabeçalhos e rodapés". Se a impressora cortar fora do tamanho, confira o tamanho do papel nas configurações do driver.

## Como o sistema protege os dados

- Só quem fez login lê ou grava dados (regras RLS). Visitantes sem login não veem nada.
- Pedidos e itens não podem ser editados nem apagados pelo sistema, o que preserva o histórico.
- Nome e preço de cada item, e o endereço de entrega, são copiados para o pedido no momento da venda.
- O preço é conferido no banco na hora de gravar, e uma chave única por tentativa impede pedido duplicado em caso de duplo clique.
- O número do pedido é sequencial e gerado pelo banco ao confirmar.

## Estrutura

```
src/pages/      Vender, Pedidos, Produtos, Clientes, Login
src/lib/        conexão com Supabase e formatação (R$, datas)
supabase/migrations/001_init.sql   tabelas, regras de segurança e função create_order
supabase/migrations/002_acrescimo_e_impressao.sql   acréscimo por item e telefone no pedido
supabase/migrations/003_categorias_taxa_obs.sql   categorias com ícone, taxa de entrega e observação por item
src/components/Print.tsx   vias de impressão (chapa e motoboy)
netlify.toml    configuração de build e rotas
```
