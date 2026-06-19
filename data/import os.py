import os
import pandas as pd

##
import gurobipy as gp
from gurobipy import GRB
##

def cargar_parametros():
    data_dir = "data"
    
    # Verificar que los archivos CSV existan
    archivos_requeridos = [
        "tipos_cirugia.csv",
        "pabellones.csv",
        "pabellones_costos.csv",
        "bloques.csv",
        "pabellones_operativos.csv",
        "pacientes.csv",
        "insumos.csv"
    ]
    for archivo in archivos_requeridos:
        ruta = os.path.join(data_dir, archivo)
        if not os.path.exists(ruta):
            raise FileNotFoundError(f"No se encontró el archivo requerido: {ruta}. Ejecuta 'generar_csv.py' primero.")
            
    print("Cargando archivos de datos...")
    df_tipos = pd.read_csv(os.path.join(data_dir, "tipos_cirugia.csv"))
    df_pabellones = pd.read_csv(os.path.join(data_dir, "pabellones.csv"))
    df_costos = pd.read_csv(os.path.join(data_dir, "pabellones_costos.csv"))
    df_bloques = pd.read_csv(os.path.join(data_dir, "bloques.csv"))
    df_operativos = pd.read_csv(os.path.join(data_dir, "pabellones_operativos.csv"))
    df_pacientes = pd.read_csv(os.path.join(data_dir, "pacientes.csv"))
    df_insumos = pd.read_csv(os.path.join(data_dir, "insumos.csv"))

    # ==========================================
    # DEFINICIÓN DE CONJUNTOS
    # ==========================================
    I = df_pacientes["id_paciente"].tolist()
    J = df_pabellones["id_pabellon"].tolist()
    D = sorted(df_bloques["dia"].unique().tolist())
    T = df_bloques["bloque"].tolist()
    
    # Subconjunto de bloques por día (T_d)
    T_d = {}
    for d in D:
        T_d[d] = df_bloques[df_bloques["dia"] == d]["bloque"].tolist()
        
    K = ["Anestesiologo", "Cirujano", "Arsenalera"]
    R = df_insumos["id_insumo"].tolist()
    C = df_tipos["tipo_cirugia"].tolist()

    # ==========================================
    # DEFINICIÓN DE PARÁMETROS
    # ==========================================
    
    # 1. p_i: Multa asociada a no operar al paciente i
    p = df_pacientes.set_index("id_paciente")["multa"].to_dict()
    
    # 2. f_jd: Costo por hora normal en pabellón j durante día d
    f = df_costos.set_index(["id_pabellon", "dia"])["costo_normal"].to_dict()
    
    # 3. q_i: Duración estimada de la cirugía del paciente i
    q = df_pacientes.set_index("id_paciente")["duracion"].to_dict()
    
    # 4. l_c: Tiempo de limpieza requerido tras cirugía tipo c
    l = df_tipos.set_index("tipo_cirugia")["limpieza"].to_dict()
    
    # 5. b_i: Tiempo en cama de recuperación para paciente i
    b = df_pacientes.set_index("id_paciente")["cama_recuperacion"].to_dict()
    
    # 6. g_t: Cantidad de bloques restantes en el día al que pertenece t
    g = df_bloques.set_index("bloque")["bloques_restantes"].to_dict()
    
    # 7. m_t: Cantidad de camas de recuperación disponibles en t
    m = df_bloques.set_index("bloque")["camas_disponibles"].to_dict()
    
    # 8. psi_kt: Cantidad de personal k disponible en t
    psi = {}
    for k in K:
        col_disp = f"disp_{k}"
        for t, val in df_bloques.set_index("bloque")[col_disp].to_dict().items():
            psi[(k, t)] = val
            
    # 9. omega_ik: Cantidad de personal k requerido para la cirugía de i
    omega = {}
    for k in K:
        col_req = f"req_{k}"
        for i, val in df_pacientes.set_index("id_paciente")[col_req].to_dict().items():
            omega[(i, k)] = val
            
    # 10. gamma_r: Stock total del insumo r mensual
    gamma = df_insumos.set_index("id_insumo")["stock_mensual"].to_dict()
    
    # 11. epsilon_ir: Consumo de insumo r por paciente i
    epsilon = {}
    for r in R:
        col_cons = f"req_{r}"
        for i, val in df_pacientes.set_index("id_paciente")[col_cons].to_dict().items():
            epsilon[(i, r)] = val
            
    # 12. mu: Porcentaje mínimo de utilización exigido para cada pabellón (ej.: 0.8)
    mu = 0.72
    
    # 13. lambda: Ponderador de sobrecosto para horas extras (ej.: 1.5)
    lambda_factor = 1.5
    
    # 14. n_jt: 1 si el pabellón j está operativo en t, 0 si no
    n = df_operativos.set_index(["id_pabellon", "bloque"])["operativo"].to_dict()
    
    # 15. phi_ic: 1 si la cirugía de i es de tipo c, 0 si no
    phi = {}
    for i in I:
        tipo_paciente = df_pacientes.set_index("id_paciente").loc[i, "tipo_cirugia"]
        for c in C:
            phi[(i, c)] = 1 if tipo_paciente == c else 0
            
    # 16. pi_jc: 1 si el pabellón j está habilitado para cirugía c, 0 si no
    pi = {}
    for j in J:
        row = df_pabellones.set_index("id_pabellon").loc[j]
        for c in C:
            col_hab = f"hab_{c}"
            pi[(j, c)] = int(row[col_hab])

    # Empaquetar todo en un diccionario para uso externo
    datos = {
        "conjuntos": {
            "I": I, "J": J, "D": D, "T": T, "T_d": T_d, "K": K, "R": R, "C": C
        },
        "parametros": {
            "p": p, "f": f, "q": q, "l": l, "b": b, "g": g, "m": m, "psi": psi,
            "omega": omega, "gamma": gamma, "epsilon": epsilon, "mu": mu,
            "lambda_factor": lambda_factor, "n": n, "phi": phi, "pi": pi
        }
    }
    
    print("Datos cargados correctamente.")
    return datos


def resolver_modelo_mejorada(datos):
    """
    Modelo de programacion de pabellones quirurgicos.

    Esta version mejora la eficiencia computacional:
    en vez de crear variables para todas las combinaciones posibles,
    crea variables solo para combinaciones factibles.
    """

    from collections import defaultdict

    # ============================
    # 1. CARGAR CONJUNTOS
    # ============================

    conjuntos = datos["conjuntos"]
    parametros = datos["parametros"]

    I = conjuntos["I"]
    J = conjuntos["J"]
    D = conjuntos["D"]
    T = conjuntos["T"]
    T_d = conjuntos["T_d"]
    K = conjuntos["K"]
    R = conjuntos["R"]
    C = conjuntos["C"]

    T_set = set(T)

    # ============================
    # 2. CARGAR PARAMETROS
    # ============================

    p = parametros["p"]
    f = parametros["f"]
    q = parametros["q"]
    l = parametros["l"]
    b = parametros["b"]
    g = parametros["g"]
    m = parametros["m"]
    psi = parametros["psi"]
    omega = parametros["omega"]
    gamma = parametros["gamma"]
    epsilon = parametros["epsilon"]
    mu = parametros["mu"]
    lambda_factor = parametros["lambda_factor"]
    n = parametros["n"]
    phi = parametros["phi"]
    pi = parametros["pi"]

    # ============================
    # 3. CONSTRUIR INDICES FACTIBLES
    # ============================

    # X_index tendra solo los inicios posibles:
    # (paciente, pabellon, bloque_inicio)
    X_index = []

    # Diccionarios auxiliares para conectar variables
    inicios_por_paciente = defaultdict(list)
    inicios_que_generan_ocupacion = defaultdict(list)
    inicios_que_generan_limpieza = defaultdict(list)
    inicios_que_generan_recuperacion = defaultdict(list)

    for i in I:
        # Limpieza correspondiente al tipo de cirugia del paciente i
        limpieza_i = sum(phi[i, c] * l[c] for c in C)

        for j in J:
            # 1 si el pabellon j es compatible con el tipo de cirugia del paciente i
            compatible = sum(phi[i, c] * pi[j, c] for c in C)

            if compatible == 0:
                continue

            for t in T:
                # Bloques ocupados por la cirugia
                bloques_cirugia = list(range(t, t + q[i]))

                # Bloques de limpieza posterior
                bloques_limpieza = list(range(t + q[i], t + q[i] + limpieza_i))

                # Bloques de recuperacion del paciente
                bloques_recuperacion = list(range(t + q[i], t + q[i] + b[i]))

                # Condicion 1: cirugia + limpieza debe terminar dentro del mismo dia
                if q[i] + limpieza_i > g[t]:
                    continue

                # Condicion 2: los bloques deben existir dentro del horizonte
                bloques_necesarios = bloques_cirugia + bloques_limpieza + bloques_recuperacion
                if not all(tau in T_set for tau in bloques_necesarios):
                    continue

                # Condicion 3: el pabellon debe estar operativo durante cirugia y limpieza
                # Esto es coherente con la restriccion O + L <= n[j,t]
                if not all(n.get((j, tau), 0) == 1 for tau in bloques_cirugia + bloques_limpieza):
                    continue

                # Si llega aqui, el inicio es factible
                idx = (i, j, t)
                X_index.append(idx)
                inicios_por_paciente[i].append(idx)

                # Este inicio genera ocupacion O durante q[i] bloques
                for tau in bloques_cirugia:
                    inicios_que_generan_ocupacion[(i, j, tau)].append(idx)

                # Este inicio genera limpieza L despues de la cirugia
                for tau in bloques_limpieza:
                    inicios_que_generan_limpieza[(j, tau)].append(idx)

                # Este inicio genera recuperacion B despues de la cirugia
                for tau in bloques_recuperacion:
                    inicios_que_generan_recuperacion[(i, tau)].append(idx)

    X_index = sorted(X_index)
    O_index = sorted(inicios_que_generan_ocupacion.keys())
    L_index = sorted(inicios_que_generan_limpieza.keys())
    B_index = sorted(inicios_que_generan_recuperacion.keys())

    # Para restricciones de capacidad y personal
    ocupacion_por_pabellon_bloque = defaultdict(list)
    for key in O_index:
        i, j, t = key
        ocupacion_por_pabellon_bloque[(j, t)].append(key)

    recuperacion_por_bloque = defaultdict(list)
    for key in B_index:
        i, t = key
        recuperacion_por_bloque[t].append(key)

    # ============================
    # 4. CREAR MODELO
    # ============================

    modelo = gp.Model("programacion_pabellones")
    modelo.Params.OutputFlag = 1
    modelo.Params.TimeLimit = 1800
    modelo.Params.MIPGap = 0.0015
    modelo.Params.MIPFocus = 1
    # modelo.Params.CutPasses = 5
    modelo.Params.Heuristics = 0.3
    modelo.Params.Seed = 2

    # ============================
    # 5. VARIABLES
    # ============================

    # X[i,j,t] = 1 si paciente i empieza cirugia en pabellon j en bloque t
    X = modelo.addVars(X_index, vtype=GRB.BINARY, name="X")

    # O[i,j,t] = 1 si paciente i ocupa pabellon j en bloque t
    O = modelo.addVars(O_index, vtype=GRB.CONTINUOUS, lb=0, ub=1, name="O")
    # O = modelo.addVars(O_index, vtype=GRB.BINARY, name="O")

    # L[j,t] = 1 si pabellon j esta en limpieza en bloque t
    L = modelo.addVars(L_index, vtype=GRB.CONTINUOUS, lb=0, ub=1, name="L")
    # L = modelo.addVars(L_index, vtype=GRB.BINARY, name="L")

    # B[i,t] = 1 si paciente i ocupa cama de recuperacion en bloque t
    B = modelo.addVars(B_index, vtype=GRB.CONTINUOUS, lb=0, ub=1, name="B")
    # B = modelo.addVars(B_index, vtype=GRB.BINARY, name="B")

    # Y[i] = 1 si paciente i queda en lista de espera
    Y = modelo.addVars(I, vtype=GRB.BINARY, name="Y")

    # H[j,d] = bloques de hora extra usados por pabellon j en dia d
    H = modelo.addVars(J, D, vtype=GRB.INTEGER, lb=0, ub=2, name="H")

    # ============================
    # 6. FUNCION OBJETIVO
    # ============================

    modelo.setObjective(
        gp.quicksum(p[i] * Y[i] for i in I)
        +
        gp.quicksum(lambda_factor * f[j, d] * H[j, d] for j in J for d in D),
        GRB.MINIMIZE
    )

    # ============================
    # 7. RESTRICCIONES
    # ============================

    # R1: Cada paciente se opera una vez o queda en lista de espera
    for i in I:
        modelo.addConstr(
            gp.quicksum(X[idx] for idx in inicios_por_paciente[i]) + Y[i] == 1,
            name=f"asignacion_{i}"
        )

    # R2 y R5 quedan incorporadas en la construccion de X_index:
    # - compatibilidad pabellon-tipo de cirugia
    # - finalizacion dentro del dia
    # - disponibilidad operativa del pabellon

    # R3 y R4: Definicion directa de ocupacion O desde los inicios X
    for key in O_index:
        modelo.addConstr(
            O[key] == gp.quicksum(X[idx] for idx in inicios_que_generan_ocupacion[key]),
            name=f"def_ocupacion_{key[0]}_{key[1]}_{key[2]}"
        )

    # R6: Definicion directa de limpieza L desde los inicios X
    for key in L_index:
        modelo.addConstr(
            L[key] == gp.quicksum(X[idx] for idx in inicios_que_generan_limpieza[key]),
            name=f"def_limpieza_{key[0]}_{key[1]}"
        )

    # R7: Definicion directa de recuperacion B desde los inicios X
    for key in B_index:
        modelo.addConstr(
            B[key] == gp.quicksum(X[idx] for idx in inicios_que_generan_recuperacion[key]),
            name=f"def_recuperacion_{key[0]}_{key[1]}"
        )

    # R8: Exclusividad de pabellon
    for j in J:
        for t in T:
            expr_ocupacion = gp.quicksum(
                O[key] for key in ocupacion_por_pabellon_bloque.get((j, t), [])
            )

            expr_limpieza = L[j, t] if (j, t) in L_index else 0

            modelo.addConstr(
                expr_ocupacion + expr_limpieza <= n[j, t],
                name=f"capacidad_pabellon_{j}_{t}"
            )

    # R9: Ocupacion diaria y horas extra
    for j in J:
        for d in D:
            uso_dia = gp.quicksum(
                gp.quicksum(
                    O[key] for key in ocupacion_por_pabellon_bloque.get((j, t), [])
                )
                +
                (L[j, t] if (j, t) in L_index else 0)
                for t in T_d[d]
            )

            capacidad_normal = gp.quicksum(n[j, t] for t in T_d[d])

            modelo.addConstr(
                uso_dia <= capacidad_normal + H[j, d],
                name=f"horas_extra_{j}_{d}"
            )

    # R10: Disponibilidad de camas de recuperacion
    for t in T:
        modelo.addConstr(
            gp.quicksum(B[key] for key in recuperacion_por_bloque.get(t, [])) <= m[t],
            name=f"camas_{t}"
        )

    # R11: Disponibilidad de personal medico
    for k in K:
        for t in T:
            demanda_personal = gp.quicksum(
                omega[i, k] * O[i, j, t]
                for (i, j, tau) in O_index
                if tau == t
            )

            modelo.addConstr(
                demanda_personal <= psi[k, t],
                name=f"personal_{k}_{t}"
            )

    # R12: Consumo de insumos criticos
    for r in R:
        modelo.addConstr(
            gp.quicksum(
                epsilon[i, r] * X[i, j, t]
                for (i, j, t) in X_index
            )
            <= gamma[r],
            name=f"insumos_{r}"
        )

    # R13: Eficiencia operativa minima
    modelo.addConstr(
        gp.quicksum(
            q[i] * X[i, j, t]
            for (i, j, t) in X_index
        )
        >=
        mu * gp.quicksum(n[j, t] for j in J for t in T),
        name="utilizacion_minima"
    )

    # ============================
    # 8. OPTIMIZAR
    # ============================

    print("\nModelo creado correctamente.")
    print(f"Pacientes: {len(I)}")
    print(f"Pabellones: {len(J)}")
    print(f"Dias: {len(D)}")
    print(f"Bloques: {len(T)}")

    print("\n--- TAMANO DE VARIABLES CREADAS ---")
    print(f"Variables X creadas: {len(X_index)}")
    print(f"Variables O creadas: {len(O_index)}")
    print(f"Variables L creadas: {len(L_index)}")
    print(f"Variables B creadas: {len(B_index)}")

    modelo.update()
    print(f"\nVariables totales: {modelo.NumVars}")
    print(f"Restricciones totales: {modelo.NumConstrs}")

    modelo.optimize()

    # ============================
    # 9. RESULTADOS
    # ============================

    if modelo.status == GRB.OPTIMAL or modelo.status == GRB.TIME_LIMIT:
        if modelo.SolCount > 0:
            if modelo.status == GRB.OPTIMAL:
                print("\n--- SOLUCION OPTIMA ENCONTRADA ---")
            else:
                print("\n--- SOLUCION FACTIBLE ENCONTRADA POR LIMITE DE TIEMPO ---")

            print(f"Valor objetivo: {modelo.objVal:,.0f}")

            pacientes_programados = []
            pacientes_no_operados = []

            for i in I:
                if Y[i].X > 0.5:
                    pacientes_no_operados.append(i)
                else:
                    for (ii, j, t) in X_index:
                        if ii == i and X[ii, j, t].X > 0.5:
                            dia = ((t - 1) // 24) + 1
                            hora = ((t - 1) % 24) + 1

                            pacientes_programados.append({
                                "paciente": i,
                                "pabellon": j,
                                "bloque": t,
                                "dia": dia,
                                "hora": hora,
                                "duracion": q[i]
                            })

            print(f"\nPacientes programados: {len(pacientes_programados)}")
            for sol in pacientes_programados:
                print(
                    f"- {sol['paciente']} en {sol['pabellon']}, "
                    f"dia {sol['dia']}, bloque {sol['bloque']}, "
                    f"hora {sol['hora']}, duracion {sol['duracion']} bloques"
                )

            print(f"\nPacientes no operados: {len(pacientes_no_operados)}")
            for i in pacientes_no_operados:
                print(f"- {i}, multa: ${p[i]:,.0f}")

        else:
            print("\nEl modelo llego al limite de tiempo sin encontrar solucion factible.")

    elif modelo.status == GRB.INFEASIBLE:
        print("\nEl modelo es infactible.")
        print("Calculando IIS para encontrar restricciones conflictivas...")

        modelo.computeIIS()
        modelo.write("modelo_infactible.ilp")

        print("Se creo el archivo modelo_infactible.ilp")

    else:
        print(f"\nEl modelo termino con status: {modelo.status}")

    return modelo

#hasta aca borrador



if __name__ == "__main__":
    try:
        data = cargar_parametros()
        
        # Resumen informativo rápido
        conj = data["conjuntos"]
        param = data["parametros"]
        
        print("\n--- RESUMEN DE CONJUNTOS ---")
        print(f"Pacientes (I): {len(conj['I'])} (desde {conj['I'][0]} hasta {conj['I'][-1]})")
        print(f"Pabellones (J): {len(conj['J'])} ({', '.join(conj['J'])})")
        print(f"Días (D): {len(conj['D'])} (1 a {conj['D'][-1]})")
        print(f"Bloques (T): {len(conj['T'])} blocks")
        print(f"Categorías personal (K): {conj['K']}")
        print(f"Insumos críticos (R): {conj['R']}")
        print(f"Tipos de cirugía (C): {conj['C']}")
        
        print("\n--- EJEMPLOS DE PARÁMETROS CARGADOS ---")
        un_paciente = conj['I'][0]
        un_pabellon = conj['J'][0]
        un_bloque = 10  # Bloque hábil en día 1
        un_insumo = conj['R'][0]
        
        print(f"p[{un_paciente}] (multa): ${param['p'][un_paciente]:,}")
        print(f"q[{un_paciente}] (duración): {param['q'][un_paciente]} bloques")
        print(f"b[{un_paciente}] (cama recup.): {param['b'][un_paciente]} bloques")
        print(f"f[{un_pabellon}, dia 1] (costo normal): ${param['f'][(un_pabellon, 1)]}")
        print(f"f[{un_pabellon}, dia 6 (fin de semana)] (costo normal): ${param['f'][(un_pabellon, 6)]}")
        print(f"n[{un_pabellon}, bloque {un_bloque}] (operatividad): {param['n'][(un_pabellon, un_bloque)]}")
        print(f"psi[Anestesiologo, bloque {un_bloque}] (disp. personal): {param['psi'][('Anestesiologo', un_bloque)]}")
        print(f"omega[{un_paciente}, Anestesiologo] (req. personal): {param['omega'][(un_paciente, 'Anestesiologo')]}")
        print(f"gamma[{un_insumo}] (stock mensual): {param['gamma'][un_insumo]} unidades")
        print(f"epsilon[{un_paciente}, {un_insumo}] (consumo): {param['epsilon'][(un_paciente, un_insumo)]}")
        print(f"mu (utilización mínima): {param['mu']}")
        print(f"lambda (factor extra): {param['lambda_factor']}")

        ##
        resolver_modelo_mejorada(data)
        ##
        
    except Exception as e:
        print(f"Error durante la ejecución: {e}")