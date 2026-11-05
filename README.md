# Amigo Secreto

Site para cinco participantes. Cada pessoa escolhe seu nome e cria uma senha que só ela conhece. Quando as cinco contas forem criadas, o sorteio acontece automaticamente e cada pessoa vê apenas o próprio resultado ao entrar.

## Rodar localmente

1. Instale o Node.js 18 ou superior.
2. Execute `npm install`.
3. Execute `npm start`.
4. Abra `http://localhost:3000`.

Cada participante deve criar seu acesso uma única vez. Senhas têm pelo menos 8 caracteres e são armazenadas como hashes. Não há recuperação de senha; se alguém esquecer, será necessário reiniciar os dados antes do sorteio.

Os nomes permitidos estão definidos em `server.js`: MariMari, Jujubas, Isinha, Aninha e Nick. Compartilhe o link apenas com essas pessoas. Cada nome pode ser registrado uma vez; quem registrar primeiro fica com aquele nome.

## Publicar no Render

1. Envie as alterações deste projeto para o GitHub.
2. Entre em [render.com](https://render.com/) usando o GitHub e autorize acesso ao repositório.
3. No painel, clique em **New +** → **Blueprint** e selecione o repositório `Amigo_Secrets`.
4. O Render lerá `render.yaml`, criará o serviço e fará o deploy. O arquivo configura `npm install`, `npm start` e um disco persistente em `/var/data`.
5. Quando o deploy terminar, abra o endereço `.onrender.com` exibido no painel e compartilhe somente com as cinco participantes.

O disco persistente do Render exige um plano pago. Ele é necessário para manter os cadastros e o resultado após reinícios e novos deploys. Não remova nem recrie o disco depois que as participantes se cadastrarem.

## Privacidade

O site não mostra uma lista de resultados: cada sessão autenticada recebe somente o resultado do próprio nome, e não existe painel de organizador. Ainda assim, quem administra a hospedagem e o código pode, tecnicamente, acessar os dados armazenados no servidor. As senhas escolhidas pelas participantes não ficam em texto aberto.

O site não envia e-mail, SMS ou WhatsApp. Depois de criar a conta, cada participante volta ao site e entra com o próprio nome e senha para ver o resultado.
